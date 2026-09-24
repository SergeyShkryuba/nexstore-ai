/** At or below this many units a product is shown as running out. */
export const LOW_STOCK_THRESHOLD = 5

export type StockLevel = 'out' | 'low' | 'in'

/** Null when the caller did not load stock — showing nothing beats guessing. */
export function stockLevel(count: number | null | undefined): StockLevel | null {
  if (count == null || !Number.isFinite(count)) return null
  if (count <= 0) return 'out'
  if (count <= LOW_STOCK_THRESHOLD) return 'low'
  return 'in'
}

/**
 * Shopper-facing wording. Exact counts are only shown when low: "Only 3 left"
 * helps a decision, "297 in stock" is noise.
 */
export function stockLabel(count: number | null | undefined): string | null {
  switch (stockLevel(count)) {
    case 'out':
      return 'Out of stock'
    case 'low':
      return `Only ${count} left`
    case 'in':
      return 'In stock'
    default:
      return null
  }
}
