import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { siteUrl } from '@/lib/site'
import { EU_COUNTRIES } from '@/lib/orders'
import { CHECKOUT_TTL_SECONDS, RESERVATION_TTL_SECONDS, shortProductId } from '@/lib/reservations'
import { resolveCartLines, type CatalogueProduct, type CheckoutLine } from '@/lib/checkout-lines'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

/**
 * The client may only tell us WHICH product, WHICH size and HOW MANY.
 *
 * It may not tell us the price. An earlier version of this route built Stripe
 * line items straight from the cart payload, which meant anyone could POST
 * `{ id: "...", price: 0.01 }` and check out a €300 product for one cent.
 * Prices, titles and sizes are re-read from the database below.
 */
const checkoutRequestSchema = z.object({
  items: z
    .array(
      z.object({
        // guid(), not uuid(): Zod 4's uuid() requires an RFC version nibble and
        // rejected every seeded product id ('00000000-…-000000000001').
        id: z.guid(),
        variantId: z.guid().nullish(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, 'Cart is empty')
    .max(50),
})

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Checkout is not configured on this deployment (STRIPE_SECRET_KEY missing).' },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = checkoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid cart' },
      { status: 400 },
    )
  }

  const { items } = parsed.data

  try {
    const supabase = await createClient()

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, title, price, image_urls, inventory_count, variants:product_variants(id, size, inventory_count)')
      .in('id', [...new Set(items.map((i) => i.id))])

    if (productsError) {
      console.error('Checkout: failed to load products', productsError)
      return NextResponse.json({ error: 'Could not verify your cart' }, { status: 503 })
    }

    // Unknown products, missing or removed sizes, and short stock are all
    // answered here — a fast, friendly check before anything is reserved.
    const resolved = resolveCartLines(items, (products ?? []) as CatalogueProduct[])
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    const { lines } = resolved

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = lines.map((line) => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: line.size ? `${line.title} — size ${line.size}` : line.title,
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
    const reservation = await reserveStock(lines)
    if ('response' in reservation) return reservation.response

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
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
            display_name: 'Free standard shipping',
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

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // Details stay in the server log. Stripe's messages can quote part of the
    // API key ("Invalid API Key provided: sk_test_…") and mean nothing to a
    // shopper anyway.
    console.error('Stripe Checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 })
  }
}

type ReservationResult = { id: string | null } | { response: NextResponse }

/**
 * Takes the requested units (of the chosen sizes) off the shelf for the length
 * of the checkout. `id: null` means reservations are not installed in this
 * database yet (schema.sql not run): checkout then works as it did before, and
 * the webhook takes the stock when payment lands.
 */
async function reserveStock(lines: readonly CheckoutLine[]): Promise<ReservationResult> {
  const service = createServiceClient()
  if (!service) {
    console.error('Checkout: SUPABASE_SERVICE_ROLE_KEY is not set; cannot reserve stock')
    return { response: NextResponse.json({ error: 'Checkout is temporarily unavailable' }, { status: 503 }) }
  }

  const { data, error } = await service.rpc('reserve_stock', {
    p_items: lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      ...(line.variantId ? { variant_id: line.variantId } : {}),
    })),
    p_ttl_seconds: RESERVATION_TTL_SECONDS,
  })
  if (!error) return { id: data as string }

  const titleOf = (productId: string) => {
    const line = lines.find((l) => l.productId === productId)
    return line ? (line.size ? `${line.title} (${line.size})` : line.title) : 'an item in your cart'
  }

  // Someone else took the last units between the check above and now.
  const shortId = shortProductId(error)
  if (shortId) {
    return {
      response: NextResponse.json(
        { error: `Not enough stock for: ${titleOf(shortId)}. Someone may be checking it out right now.` },
        { status: 409 },
      ),
    }
  }

  // The product gained sizes after the check above (an admin edit mid-checkout).
  if (error.message === 'variant_required') {
    return {
      response: NextResponse.json(
        { error: 'Sizes changed for an item in your cart. Please refresh your cart and choose a size.' },
        { status: 409 },
      ),
    }
  }

  // PGRST202: the function does not exist yet.
  if (error.code === 'PGRST202') {
    console.error('Checkout: reserve_stock() is missing; run supabase/schema.sql. Continuing without a reservation.')
    return { id: null }
  }

  console.error('Checkout: stock reservation failed', error)
  return { response: NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 503 }) }
}

async function releaseReservation(reservationId: string | null) {
  if (!reservationId) return
  const { error } = (await createServiceClient()?.rpc('release_reservation', { p_reservation_id: reservationId })) ?? {}
  // Not fatal: the reservation expires on its own and the next checkout or the
  // daily cron releases it.
  if (error) console.error('Checkout: could not release reservation', reservationId, error)
}
