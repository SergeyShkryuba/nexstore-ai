import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { orderItemsFromLineItems, shippingFromSession } from '@/lib/orders'
import { DELAYED_PAYMENT_HOLD_DAYS, isUuidShaped, reservationIdFrom } from '@/lib/reservations'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(req: Request) {
  if (!stripe || !endpointSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }

  // Webhooks arrive without a user session: writes need the service role.
  const supabase = createServiceClient()
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
    switch (event.type) {
      // Cards are paid on `completed`. Delayed methods (SEPA debit) complete
      // unpaid, keep their stock held, and settle with one of the async events.
      case 'checkout.session.completed':
        if (event.data.object.payment_status === 'paid') {
          await recordPaidSession(supabase, stripe, event.data.object)
        } else {
          await holdForDelayedPayment(supabase, event.data.object)
        }
        break
      case 'checkout.session.async_payment_succeeded':
        await recordPaidSession(supabase, stripe, event.data.object)
        break
      // Not paid, and never will be: the units go back on sale.
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await releaseStock(supabase, event.data.object)
        break
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    // 500 makes Stripe retry. Safe: every database step below is a single
    // transaction and idempotent, so a retry can neither duplicate an order
    // nor return or take stock twice.
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

  // Order, lines and stock in one transaction: all or nothing. A held
  // reservation becomes the sale; without one the stock is taken now.
  const { error } = await supabase.rpc('record_paid_order', {
    p_session_id: session.id,
    // Set by our checkout route; anything not shaped like an id would fail the
    // uuid cast on every retry, so it is dropped rather than passed through.
    p_user_id: isUuidShaped(session.client_reference_id) ? session.client_reference_id : null,
    p_email: session.customer_details?.email ?? null,
    p_total: (session.amount_total ?? 0) / 100,
    p_shipping: shippingFromSession(session),
    p_items: orderItemsFromLineItems(lineItems.data),
    p_reservation_id: reservationIdFrom(session.metadata),
  })

  if (error) throw new Error(`record_paid_order failed: ${error.message}`)
}

async function holdForDelayedPayment(supabase: SupabaseClient, session: Stripe.Checkout.Session) {
  const reservationId = reservationIdFrom(session.metadata)
  if (!reservationId) return
  const until = new Date(Date.now() + DELAYED_PAYMENT_HOLD_DAYS * 24 * 60 * 60 * 1000)
  const { error } = await supabase.rpc('extend_reservation', {
    p_reservation_id: reservationId,
    p_until: until.toISOString(),
  })
  if (error) throw new Error(`extend_reservation failed: ${error.message}`)
}

async function releaseStock(supabase: SupabaseClient, session: Stripe.Checkout.Session) {
  const reservationId = reservationIdFrom(session.metadata)
  // Sessions from before reservations existed hold nothing to release.
  if (!reservationId) return
  const { error } = await supabase.rpc('release_reservation', { p_reservation_id: reservationId })
  if (error) throw new Error(`release_reservation failed: ${error.message}`)
}
