import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

/**
 * Webhooks arrive without a user session, so they need the service-role key to
 * write past RLS. Falling back to the anon key (as an earlier version did) only
 * produced silent write failures, so this now refuses to run without it.
 */
function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

export async function POST(req: Request) {
  if (!stripe || !endpointSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    console.error('Webhook: SUPABASE_SERVICE_ROLE_KEY is not set; refusing to process events')
    return NextResponse.json({ error: 'Server is not configured' }, { status: 503 })
  }

  const payload = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, endpointSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Webhook signature verification failed: ${message}`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(supabase, stripe, event.data.object)
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    // Returning 500 makes Stripe retry, which is what we want for a transient
    // database failure. The unique constraint on stripe_session_id keeps the
    // retry from creating a duplicate order.
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 })
  }
}

async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== 'paid') return

  // Idempotency: Stripe delivers at-least-once, and a retry must not duplicate
  // the order. `stripe_session_id` is UNIQUE in the schema.
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (existing) return

  const lineItems = await stripeClient.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  })

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: session.client_reference_id || null,
      total_amount: (session.amount_total ?? 0) / 100,
      status: 'paid',
      stripe_session_id: session.id,
      customer_email: session.customer_details?.email ?? null,
      shipping_address: session.customer_details?.address ?? null,
    })
    .select('id')
    .single()

  if (orderError) {
    // 23505 = unique_violation: a concurrent delivery won the race. Not an error.
    if (orderError.code === '23505') return
    throw new Error(`Failed to insert order: ${orderError.message}`)
  }

  const orderItems = lineItems.data
    .map((item) => {
      const product = item.price?.product
      const productId =
        typeof product === 'object' && product !== null && 'metadata' in product
          ? (product.metadata?.product_id ?? null)
          : null
      const quantity = item.quantity ?? 1
      return {
        order_id: order.id,
        product_id: productId,
        quantity,
        // Schema column is `unit_price`, not `price_at_time`.
        unit_price: (item.amount_total ?? 0) / 100 / quantity,
      }
    })
    .filter((row) => row.product_id !== null)

  if (orderItems.length > 0) {
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) throw new Error(`Failed to insert order items: ${itemsError.message}`)
  }

  // Decrement stock for what was actually paid for.
  for (const row of orderItems) {
    const { error } = await supabase.rpc('decrement_inventory', {
      p_product_id: row.product_id,
      p_quantity: row.quantity,
    })
    if (error) console.error('Failed to decrement inventory', row.product_id, error.message)
  }
}
