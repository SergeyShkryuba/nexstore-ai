/** Shared money formatting. The store prices and Stripe checkout are both EUR. */
const priceFormatter = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatPrice(value: number | string): string {
  const amount = typeof value === 'string' ? Number.parseFloat(value) : value
  if (!Number.isFinite(amount)) return priceFormatter.format(0)
  return priceFormatter.format(amount)
}

/** Average of a set of 1–5 ratings, rounded to one decimal. Null when empty. */
export function averageRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((acc, r) => acc + r, 0)
  return Math.round((sum / ratings.length) * 10) / 10
}
