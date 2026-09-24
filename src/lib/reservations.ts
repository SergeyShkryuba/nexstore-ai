/**
 * Timing for stock reservations (see "Stock reservations" in schema.sql).
 */

/** Stripe's minimum Checkout Session lifetime is 30 minutes; one more for clock skew. */
export const CHECKOUT_TTL_SECONDS = 31 * 60

/**
 * The reservation outlives the session by a margin, so stock is never back on
 * sale while Stripe could still accept payment for it. Stripe's
 * `checkout.session.expired` event releases it on time; this is the fallback.
 */
export const RESERVATION_TTL_SECONDS = CHECKOUT_TTL_SECONDS + 5 * 60

/**
 * Delayed methods (SEPA Direct Debit) can take up to 14 days to settle; the
 * units stay held until Stripe reports success or failure.
 */
export const DELAYED_PAYMENT_HOLD_DAYS = 14

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The reservation id checkout stored on the session, if it is one. */
export function reservationIdFrom(metadata: Record<string, string> | null | undefined): string | null {
  const id = metadata?.reservation_id
  return id && UUID_SHAPE.test(id) ? id : null
}

export function isUuidShaped(value: string | null | undefined): value is string {
  return !!value && UUID_SHAPE.test(value)
}

/**
 * Postgres error from reserve_stock() → the product that ran short, if that is
 * what happened. PostgREST passes RAISE ... USING DETAIL through as `details`.
 */
export function shortProductId(error: { message?: string; details?: string | null } | null): string | null {
  if (!error || error.message !== 'insufficient_stock') return null
  return isUuidShaped(error.details) ? error.details : null
}

/** Units per product sitting in open checkouts, from held reservations' items. */
export function heldUnitsByProduct(
  reservations: readonly { items: unknown }[] | null | undefined,
): Map<string, number> {
  const held = new Map<string, number>()
  for (const reservation of reservations ?? []) {
    if (!Array.isArray(reservation.items)) continue
    for (const item of reservation.items as { product_id?: unknown; quantity?: unknown }[]) {
      if (typeof item?.product_id !== 'string' || typeof item.quantity !== 'number') continue
      held.set(item.product_id, (held.get(item.product_id) ?? 0) + item.quantity)
    }
  }
  return held
}
