import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { orderItemsFromLineItems, shippingFromSession } from '@/lib/orders'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    // Card payments are paid by `completed`. Delayed methods (SEPA debit and
    // the like) complete unpaid and confirm later with `async_payment_succeeded`
    // — ignoring that event used to lose those orders entirely.
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await recordPaidSession(supabase, stripe, event.data.object)
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    // 500 makes Stripe retry. Safe: record_paid_order is a single transaction
    // (nothing half-written survives a failure) and idempotent per session.
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 })
  }
}

async function recordPaidSession(
  supabase: SupabaseClient,
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== 'paid') return

  // Cheap early exit for Stripe's at-least-once redeliveries. Not what
  // guarantees "no duplicates" — the unique stripe_session_id inside the
  // transaction does — it only saves the line-items call below.
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

  // Order, lines and stock decrement in one transaction: all or nothing.
  const { error } = await supabase.rpc('record_paid_order', {
    p_session_id: session.id,
    // Set by our checkout route; anything not shaped like an id would fail the
    // uuid cast on every retry, so it is dropped rather than passed through.
    p_user_id: UUID_SHAPE.test(session.client_reference_id ?? '') ? session.client_reference_id : null,
    p_email: session.customer_details?.email ?? null,
    p_total: (session.amount_total ?? 0) / 100,
    p_shipping: shippingFromSession(session),
    p_items: orderItemsFromLineItems(lineItems.data),
  })

  if (error) throw new Error(`record_paid_order failed: ${error.message}`)
}
