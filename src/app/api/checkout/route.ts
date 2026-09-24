import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { siteUrl } from '@/lib/site'
import { EU_COUNTRIES } from '@/lib/orders'
import { CHECKOUT_TTL_SECONDS, RESERVATION_TTL_SECONDS, shortProductId } from '@/lib/reservations'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

/**
 * The client may only tell us WHICH product and HOW MANY.
 *
 * It may not tell us the price. An earlier version of this route built Stripe
 * line items straight from the cart payload, which meant anyone could POST
 * `{ id: "...", price: 0.01 }` and check out a €300 product for one cent.
 * Prices and titles are re-read from the database below.
 */
const checkoutRequestSchema = z.object({
  items: z
    .array(
      z.object({
        // guid(), not uuid(): Zod 4's uuid() requires an RFC version nibble and
        // rejected every seeded product id ('00000000-…-000000000001').
        id: z.guid(),
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

  // Collapse duplicate ids so a repeated line cannot bypass the stock check.
  const requested = new Map<string, number>()
  for (const item of items) {
    requested.set(item.id, (requested.get(item.id) ?? 0) + item.quantity)
  }

  try {
    const supabase = await createClient()

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, title, price, image_urls, inventory_count')
      .in('id', [...requested.keys()])

    if (productsError) {
      console.error('Checkout: failed to load products', productsError)
      return NextResponse.json({ error: 'Could not verify your cart' }, { status: 503 })
    }

    const found = new Map((products ?? []).map((p) => [p.id as string, p]))

    const missing = [...requested.keys()].filter((id) => !found.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Some items are no longer available. Please refresh your cart.' },
        { status: 409 },
      )
    }

    const outOfStock = [...requested.entries()]
      .filter(([id, qty]) => (found.get(id)!.inventory_count ?? 0) < qty)
      .map(([id]) => found.get(id)!.title as string)

    if (outOfStock.length > 0) {
      return NextResponse.json(
        { error: `Not enough stock for: ${outOfStock.join(', ')}` },
        { status: 409 },
      )
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [...requested.entries()].map(
      ([id, quantity]) => {
        const product = found.get(id)!
        const imageUrl = (product.image_urls as string[] | null)?.[0]
        return {
          price_data: {
            currency: 'eur',
            product_data: {
              name: product.title as string,
              ...(imageUrl ? { images: [imageUrl] } : {}),
              // Carried through to the webhook so order_items can reference the
              // real catalogue row rather than a Stripe-side product id.
              metadata: { product_id: id },
            },
            // Authoritative price, from the database, in cents.
            unit_amount: Math.round(Number(product.price) * 100),
          },
          quantity,
        }
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const origin =
      req.headers.get('origin') ?? siteUrl

    // Hold the units before sending the shopper to pay. The check above is a
    // fast, friendly answer; this is the one that cannot oversell.
    const reservation = await reserveStock(requested, found)
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
 * Takes the requested units off the shelf for the length of the checkout.
 * `id: null` means reservations are not installed in this database yet
 * (schema.sql not run): checkout then works as it did before, and the webhook
 * takes the stock when payment lands.
 */
async function reserveStock(
  requested: Map<string, number>,
  products: Map<string, { title: unknown }>,
): Promise<ReservationResult> {
  const service = createServiceClient()
  if (!service) {
    console.error('Checkout: SUPABASE_SERVICE_ROLE_KEY is not set; cannot reserve stock')
    return { response: NextResponse.json({ error: 'Checkout is temporarily unavailable' }, { status: 503 }) }
  }

  const { data, error } = await service.rpc('reserve_stock', {
    p_items: [...requested.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
    p_ttl_seconds: RESERVATION_TTL_SECONDS,
  })
  if (!error) return { id: data as string }

  // Someone else took the last units between the check above and now.
  const shortId = shortProductId(error)
  if (shortId) {
    const title = String(products.get(shortId)?.title ?? 'an item in your cart')
    return {
      response: NextResponse.json(
        { error: `Not enough stock for: ${title}. Someone may be checking it out right now.` },
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
