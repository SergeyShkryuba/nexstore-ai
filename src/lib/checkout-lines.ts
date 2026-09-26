/**
 * Turns the cart a browser sends into checkout lines, using only what the
 * database says: title, price, sizes and stock. Pure, so every refusal below
 * is unit-tested.
 */

import { cartLineKey } from './variants'

/**
 * Most units of one product (or size) in one order. Checkout holds the units
 * while the shopper pays, so this also bounds how much of the shelf a single
 * checkout can take off sale. The cart enforces the same number.
 */
export const MAX_UNITS_PER_LINE = 10

export type RequestedItem = { id: string; variantId?: string | null; quantity: number }

export type CatalogueProduct = {
  id: string
  title: string
  price: number | string
  image_urls: string[] | null
  inventory_count: number
  variants?: { id: string; size: string; inventory_count: number }[] | null
}

export type CheckoutLine = {
  productId: string
  variantId: string | null
  size: string | null
  title: string
  /** Authoritative, from the database. */
  unitPrice: number
  imageUrl: string | null
  quantity: number
}

/**
 * Why a cart was refused, as a code with the product names it concerns; the
 * route words it in the shopper's language (`Checkout.lines.*` messages).
 */
export type LineError =
  | { code: 'unavailable' }
  | { code: 'sizeRequired'; title: string }
  | { code: 'sizeGone'; title: string }
  | { code: 'short'; items: string }

export type LinesResult = { ok: true; lines: CheckoutLine[] } | ({ ok: false; status: 409 } & LineError)

export function resolveCartLines(items: readonly RequestedItem[], products: readonly CatalogueProduct[]): LinesResult {
  // One line per product and size. Duplicates are merged, so repeating a line
  // cannot slip past the stock check.
  const merged = new Map<string, RequestedItem>()
  for (const item of items) {
    const key = cartLineKey(item.id, item.variantId)
    const prev = merged.get(key)
    merged.set(key, { ...item, quantity: (prev?.quantity ?? 0) + item.quantity })
  }

  const byId = new Map(products.map((p) => [p.id, p]))
  const lines: CheckoutLine[] = []
  const short: string[] = []

  for (const item of merged.values()) {
    const product = byId.get(item.id)
    if (!product) {
      return { ok: false, status: 409, code: 'unavailable' }
    }

    const variants = product.variants ?? []
    let variant: { id: string; size: string; inventory_count: number } | null = null

    if (variants.length > 0) {
      if (!item.variantId) {
        // An old cart, or a hand-made request: a sized product needs a size.
        return { ok: false, status: 409, code: 'sizeRequired', title: product.title }
      }
      variant = variants.find((v) => v.id === item.variantId) ?? null
      if (!variant) {
        return { ok: false, status: 409, code: 'sizeGone', title: product.title }
      }
    } else if (item.variantId) {
      return { ok: false, status: 409, code: 'unavailable' }
    }

    const available = variant ? variant.inventory_count : product.inventory_count
    if (available < item.quantity) short.push(variant ? `${product.title} (${variant.size})` : product.title)

    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      size: variant?.size ?? null,
      title: product.title,
      unitPrice: Number(product.price),
      imageUrl: product.image_urls?.[0] ?? null,
      quantity: item.quantity,
    })
  }

  if (short.length > 0) return { ok: false, status: 409, code: 'short', items: short.join(', ') }
  return { ok: true, lines }
}
