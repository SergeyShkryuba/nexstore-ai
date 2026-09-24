/**
 * Order helpers shared by checkout, the Stripe webhook and the order pages.
 * Pure: plain data in, plain data out.
 */

/** EU member states — the shipping policy promises delivery "within the EU". */
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
] as const

export type PostalAddress = {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}

/** What `orders.shipping_address` holds for orders placed from now on. */
export type OrderShipping = {
  name: string | null
  phone: string | null
  address: PostalAddress | null
}

type SessionLike = {
  collected_information?: {
    shipping_details?: { name?: string | null; address?: PostalAddress | null } | null
  } | null
  customer_details?: {
    name?: string | null
    phone?: string | null
    address?: PostalAddress | null
  } | null
}

/**
 * Shipping details from a completed Checkout Session. Since Stripe API
 * 2025-03-31 they live under `collected_information`; the billing address in
 * `customer_details` is only a fallback, for sessions that collected no
 * shipping address.
 */
export function shippingFromSession(session: SessionLike): OrderShipping | null {
  const shipping = session.collected_information?.shipping_details
  const customer = session.customer_details
  const result: OrderShipping = {
    name: shipping?.name ?? customer?.name ?? null,
    phone: customer?.phone ?? null,
    address: shipping?.address ?? customer?.address ?? null,
  }
  return result.name || result.phone || result.address ? result : null
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function countryName(code: string | null | undefined): string | null {
  if (!code) return null
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * `orders.shipping_address` as display lines. Orders placed before shipping
 * collection stored a bare address object; newer ones store `OrderShipping`.
 * Both are read; anything unrecognised gives no lines.
 */
export function shippingLines(stored: unknown): { name: string | null; phone: string | null; lines: string[] } {
  if (!isRecord(stored)) return { name: null, phone: null, lines: [] }

  const isNew = 'address' in stored || 'name' in stored || 'phone' in stored
  const address = (isNew ? stored.address : stored) as PostalAddress | null | undefined
  const name = isNew && typeof stored.name === 'string' ? stored.name : null
  const phone = isNew && typeof stored.phone === 'string' ? stored.phone : null

  if (!isRecord(address)) return { name, phone, lines: [] }

  const cityLine = [address.postal_code, address.city].filter(Boolean).join(' ')
  const lines = [
    address.line1,
    address.line2,
    [cityLine, address.state].filter(Boolean).join(', '),
    countryName(address.country),
  ].filter((line): line is string => typeof line === 'string' && line.trim() !== '')

  return { name, phone, lines }
}

export type ProgressStep = { key: 'paid' | 'shipped' | 'delivered'; label: string; done: boolean }

const STEPS: { key: ProgressStep['key']; label: string }[] = [
  { key: 'paid', label: 'Paid' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
]

/**
 * The happy path an order moves along, and whether it left it. A cancelled or
 * refunded order shows no progress — only the outcome.
 */
export function orderProgress(status: string): {
  steps: ProgressStep[]
  outcome: 'cancelled' | 'refunded' | null
} {
  if (status === 'cancelled' || status === 'refunded') {
    return { steps: STEPS.map((s) => ({ ...s, done: false })), outcome: status }
  }
  const reached = STEPS.findIndex((s) => s.key === status)
  return { steps: STEPS.map((s, i) => ({ ...s, done: i <= reached })), outcome: null }
}

type LineItemLike = {
  quantity: number | null
  /** Cents, after discounts, for the whole line. */
  amount_total: number
  /** An id string, a Product, or a DeletedProduct (which has no metadata). */
  price?: { product?: unknown } | null
}

export type PaidLine = { product_id: string | null; quantity: number; unit_price: number }

/**
 * Order lines from a paid session's line items (with `price.product`
 * expanded). The catalogue id travels in the product metadata that checkout
 * sets. A line without one is still recorded — it was paid for — just not
 * linked to a product.
 */
export function orderItemsFromLineItems(items: readonly LineItemLike[]): PaidLine[] {
  return items.map((item) => {
    const product = item.price?.product
    const metadata =
      typeof product === 'object' && product !== null && 'metadata' in product
        ? (product.metadata as Record<string, string> | null)
        : null
    const productId = metadata?.product_id ?? null
    const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1
    return {
      product_id: productId,
      quantity,
      // What was actually paid per unit, in euros.
      unit_price: Math.round(item.amount_total / quantity) / 100,
    }
  })
}
