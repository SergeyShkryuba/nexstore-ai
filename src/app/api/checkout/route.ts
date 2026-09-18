import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'

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
        id: z.string().uuid(),
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
      req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
      customer_email: user?.email,
      client_reference_id: user?.id,
      metadata: {
        // Compact enough to stay inside Stripe's 500-character metadata limit.
        cart: JSON.stringify([...requested.entries()].map(([id, qty]) => [id, qty])).slice(0, 480),
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Checkout error:', error)
    const message =
      error instanceof Stripe.errors.StripeError
        ? error.message
        : 'Checkout failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
