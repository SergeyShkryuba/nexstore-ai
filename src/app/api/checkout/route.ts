import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { siteUrl } from '@/lib/site'
import { EU_COUNTRIES } from '@/lib/orders'
import { CHECKOUT_TTL_SECONDS, RESERVATION_TTL_SECONDS, shortProductId } from '@/lib/reservations'
import { MAX_UNITS_PER_LINE, resolveCartLines, type CatalogueProduct, type CheckoutLine } from '@/lib/checkout-lines'
import { clientIp, hitLimit, limitKey, MAX_HELD_CHECKOUTS } from '@/lib/rate-limit'
import { PRODUCT_TRANSLATIONS, localizeProducts } from '@/lib/localized'
import { translatorFor } from '@/i18n/messages'
import { localizedPath } from '@/i18n/routing'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

type T = ReturnType<typeof translatorFor>['t']

/**
 * The client may only tell us WHICH product, WHICH size and HOW MANY (and
 * which language to answer in).
 *
 * It may not tell us the price. An earlier version of this route built Stripe
 * line items straight from the cart payload, which meant anyone could POST
 * `{ id: "...", price: 0.01 }` and check out a €300 product for one cent.
 * Prices, titles and sizes are re-read from the database below.
 *
 * Validation messages are codes, worded in the shopper's language below.
 */
const checkoutRequestSchema = z.object({
  items: z
    .array(
      z.object({
        // guid(), not uuid(): Zod 4's uuid() requires an RFC version nibble and
        // rejected every seeded product id ('00000000-…-000000000001').
        id: z.guid(),
        variantId: z.guid().nullish(),
        quantity: z.number().int().min(1).max(MAX_UNITS_PER_LINE, 'maxPerLine'),
      }),
    )
    .min(1, 'emptyCart')
    .max(50),
})

export async function POST(req: Request) {
  // Read first, so every answer below — errors included — is in the shopper's
  // language. Reading a small JSON body is not the expensive part a flood
  // would aim at; the limiter still runs before any database or Stripe call.
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // Answered after the limiter, like any other bad request.
  }
  const { locale, t } = translatorFor((body as { locale?: unknown } | null)?.locale)

  if (!stripe) {
    return NextResponse.json({ error: t('Checkout.notConfigured') }, { status: 503 })
  }

  // Counted before any work, invalid requests included: flooding with
  // garbage should cost the sender, not the database.
  const ip = clientIp(req.headers)
  const limited = await hitLimit(createServiceClient(), 'checkout', ip)
  if (!limited.allowed) {
    return NextResponse.json(
      { error: t('Checkout.tooManyAttempts') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  if (body === null) {
    return NextResponse.json({ error: t('Checkout.invalidCart') }, { status: 400 })
  }

  const parsed = checkoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message
    const error =
      code === 'maxPerLine'
        ? t('Checkout.maxPerLine', { max: MAX_UNITS_PER_LINE })
        : code === 'emptyCart'
          ? t('Checkout.emptyCart')
          : t('Checkout.invalidCart')
    return NextResponse.json({ error }, { status: 400 })
  }

  const { items } = parsed.data

  try {
    const supabase = await createClient()

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`id, title, price, image_urls, inventory_count, variants:product_variants(id, size, inventory_count), ${PRODUCT_TRANSLATIONS}`)
      .in('id', [...new Set(items.map((i) => i.id))])

    if (productsError) {
      console.error('Checkout: failed to load products', productsError)
      return NextResponse.json({ error: t('Checkout.verifyFailed') }, { status: 503 })
    }

    // Unknown products, missing or removed sizes, and short stock are all
    // answered here — a fast, friendly check before anything is reserved.
    // Titles are in the shopper's language, for Stripe's page and the errors.
    const resolved = resolveCartLines(items, localizeProducts(products, locale) as CatalogueProduct[])
    if (!resolved.ok) {
      const error =
        resolved.code === 'unavailable'
          ? t('Checkout.lines.unavailable')
          : resolved.code === 'short'
            ? t('Checkout.lines.short', { items: resolved.items })
            : t(`Checkout.lines.${resolved.code}`, { title: resolved.title })
      return NextResponse.json({ error }, { status: resolved.status })
    }
    const { lines } = resolved

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = lines.map((line) => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: line.size ? t('Checkout.lineName', { title: line.title, size: line.size }) : line.title,
          ...(line.imageUrl ? { images: [line.imageUrl] } : {}),
          // Carried through to the webhook so order_items can reference the
          // real catalogue row (and size) rather than a Stripe-side product.
          metadata: {
            product_id: line.productId,
            ...(line.variantId ? { variant_id: line.variantId, variant_label: line.size ?? '' } : {}),
          },
        },
        // Authoritative price, from the database, in cents.
        unit_amount: Math.round(line.unitPrice * 100),
      },
      quantity: line.quantity,
    }))

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const origin =
      req.headers.get('origin') ?? siteUrl

    // Hold the units before sending the shopper to pay. The check above is a
    // fast, friendly answer; this is the one that cannot oversell.
    // Signed-in shoppers are counted per account, so people sharing an IP
    // (an office, a mobile carrier's NAT) do not use up each other's cap.
    const owner = limitKey('reservation', user ? `user:${user.id}` : `ip:${ip}`)
    const reservation = await reserveStock(lines, owner, t)
    if ('response' in reservation) return reservation.response

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      // Stripe's page in the shopper's language, and back to the store in it.
      locale,
      success_url: `${origin}${localizedPath('/checkout/success', locale)}?session_id={CHECKOUT_SESSION_ID}`,
      // Stripe's "back" link. The cart uses the id to close this session and
      // put the units back on sale at once (POST /api/checkout/cancel).
      cancel_url: `${origin}${localizedPath('/cart', locale)}${reservation.id ? `?cancelled=${reservation.id}` : ''}`,
      customer_email: user?.email,
      client_reference_id: user?.id,
      // The session and the reservation end together; the webhook releases the
      // units on `checkout.session.expired`.
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
      ...(reservation.id ? { metadata: { reservation_id: reservation.id } } : {}),
      // What the shipping page promises: free EU delivery in 2–5 business days.
      shipping_address_collection: { allowed_countries: [...EU_COUNTRIES] },
      phone_number_collection: { enabled: true },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: t('Checkout.freeShipping'),
            fixed_amount: { amount: 0, currency: 'eur' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 5 },
            },
          },
        },
      ],
      })
      if (!session.url) throw new Error('Stripe did not return a checkout URL')
    } catch (error) {
      // No session, so no webhook will ever release these units: do it now.
      await releaseReservation(reservation.id)
      throw error
    }

    await linkSession(reservation.id, session.id)

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // Details stay in the server log. Stripe's messages can quote part of the
    // API key ("Invalid API Key provided: sk_test_…") and mean nothing to a
    // shopper anyway.
    console.error('Stripe Checkout error:', error)
    return NextResponse.json({ error: t('Checkout.failed') }, { status: 500 })
  }
}

type ReservationResult = { id: string | null } | { response: NextResponse }

/**
 * Takes the requested units (of the chosen sizes) off the shelf for the length
 * of the checkout. `id: null` means reservations are not installed in this
 * database yet (schema.sql not run): checkout then works as it did before, and
 * the webhook takes the stock when payment lands.
 */
async function reserveStock(
  lines: readonly CheckoutLine[],
  ownerKey: string | null,
  t: T,
): Promise<ReservationResult> {
  const service = createServiceClient()
  if (!service) {
    console.error('Checkout: SUPABASE_SERVICE_ROLE_KEY is not set; cannot reserve stock')
    return { response: NextResponse.json({ error: t('Checkout.unavailable') }, { status: 503 }) }
  }

  const { data, error } = await service.rpc('reserve_stock', {
    p_items: lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      ...(line.variantId ? { variant_id: line.variantId } : {}),
    })),
    p_ttl_seconds: RESERVATION_TTL_SECONDS,
    ...(ownerKey ? { p_owner_key: ownerKey, p_max_held: MAX_HELD_CHECKOUTS } : {}),
  })
  if (!error) return { id: data as string }

  if (error.message === 'too_many_reservations') {
    return { response: NextResponse.json({ error: t('Checkout.tooManyOpen') }, { status: 429 }) }
  }

  const titleOf = (productId: string) => {
    const line = lines.find((l) => l.productId === productId)
    if (!line) return t('Checkout.anItem')
    return line.size ? t('Checkout.lineName', { title: line.title, size: line.size }) : line.title
  }

  // Someone else took the last units between the check above and now.
  const shortId = shortProductId(error)
  if (shortId) {
    return {
      response: NextResponse.json({ error: t('Checkout.takenMeanwhile', { item: titleOf(shortId) }) }, { status: 409 }),
    }
  }

  // The product gained sizes after the check above (an admin edit mid-checkout).
  if (error.message === 'variant_required') {
    return { response: NextResponse.json({ error: t('Checkout.sizesChanged') }, { status: 409 }) }
  }

  // PGRST202: the function does not exist yet.
  if (error.code === 'PGRST202') {
    console.error('Checkout: reserve_stock() is missing; run supabase/schema.sql. Continuing without a reservation.')
    return { id: null }
  }

  console.error('Checkout: stock reservation failed', error)
  return { response: NextResponse.json({ error: t('Checkout.failed') }, { status: 503 }) }
}

/**
 * Records which Stripe session holds the reservation, so cancelling from the
 * cart can close it. Not fatal: without the link, cancel does nothing and the
 * units come back when the session expires, as before.
 */
async function linkSession(reservationId: string | null, sessionId: string) {
  if (!reservationId) return
  const { error } =
    (await createServiceClient()
      ?.from('stock_reservations')
      .update({ stripe_session_id: sessionId })
      .eq('id', reservationId)) ?? {}
  if (error) console.error('Checkout: could not link the reservation to its session', reservationId, error)
}

async function releaseReservation(reservationId: string | null) {
  if (!reservationId) return
  const { error } = (await createServiceClient()?.rpc('release_reservation', { p_reservation_id: reservationId })) ?? {}
  // Not fatal: the reservation expires on its own and the next checkout or the
  // daily cron releases it.
  if (error) console.error('Checkout: could not release reservation', reservationId, error)
}
