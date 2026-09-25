import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { clientIp, hitLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

const cancelRequestSchema = z.object({ reservationId: z.guid() })

/**
 * `POST /api/checkout/cancel` — the shopper came back from Stripe's page via
 * its "back" link (`cancel_url` carries the reservation id).
 *
 * Closes the Stripe session first and releases the units only if that worked.
 * The order matters: a session that was paid in the meantime (another tab)
 * cannot be expired, so its units are never put back on sale under a paid
 * order. Releasing is idempotent, so the `checkout.session.expired` webhook
 * that follows changes nothing.
 *
 * Knowing the reservation id is the permission: it is a random UUID that only
 * the shopper's browser (and Stripe) has seen.
 */
export async function POST(req: Request) {
  const service = createServiceClient()
  if (!stripe || !service) return NextResponse.json({ released: false })

  const limited = await hitLimit(service, 'cancel', clientIp(req.headers))
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = cancelRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reservation' }, { status: 400 })
  const { reservationId } = parsed.data

  const { data: reservation, error } = await service
    .from('stock_reservations')
    .select('status, stripe_session_id')
    .eq('id', reservationId)
    .maybeSingle()
  if (error) {
    console.error('Checkout cancel: could not read the reservation', error)
    return NextResponse.json({ released: false })
  }
  // Unknown, already released or paid, or from before sessions were linked:
  // nothing to do, and nothing worth telling the caller about.
  if (!reservation || reservation.status !== 'held' || !reservation.stripe_session_id) {
    return NextResponse.json({ released: false })
  }

  try {
    await stripe.checkout.sessions.expire(reservation.stripe_session_id)
  } catch (expireError) {
    // Usually: the session is already complete (paid) or expired. Either way
    // the webhook owns what happens to the units.
    console.error('Checkout cancel: Stripe did not expire the session', expireError)
    return NextResponse.json({ released: false })
  }

  const { data: released, error: releaseError } = await service.rpc('release_reservation', {
    p_reservation_id: reservationId,
  })
  if (releaseError) {
    // The session is closed, so Stripe's `expired` webhook releases them.
    console.error('Checkout cancel: release failed; the expired webhook will retry it', releaseError)
    return NextResponse.json({ released: false })
  }
  return NextResponse.json({ released: released === true })
}
