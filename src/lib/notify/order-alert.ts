import type { SupabaseClient } from '@supabase/supabase-js'
import { LOW_STOCK_THRESHOLD } from '@/lib/stock'
import type { OrderShipping, PaidLine } from '@/lib/orders'
import type { LowStock, OwnerAlert } from './alerts'

type StockRow = {
  id: string
  title: string
  inventory_count: number
  variants: Array<{ id: string; size: string; inventory_count: number }> | null
}

/**
 * What the order left at or under the low-stock mark: per size for sized
 * products, the product total otherwise. Pure, for testing.
 */
export function lowStockAfter(lines: readonly PaidLine[], stock: readonly StockRow[]): LowStock[] {
  const byId = new Map(stock.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const low: LowStock[] = []
  for (const line of lines) {
    const product = line.product_id ? byId.get(line.product_id) : undefined
    if (!product) continue
    const variant = line.variant_id ? product.variants?.find((v) => v.id === line.variant_id) : undefined
    const key = variant ? variant.id : product.id
    if (seen.has(key)) continue
    seen.add(key)
    const left = variant ? variant.inventory_count : product.inventory_count
    if (left <= LOW_STOCK_THRESHOLD) low.push({ title: product.title, size: variant?.size ?? null, left })
  }
  return low
}

/** The new-order alert: Stripe's line names, where it goes, and what is running low. */
export async function buildOrderAlert(
  supabase: Pick<SupabaseClient, 'from'>,
  order: {
    id: string
    total: number
    email: string | null
    shipping: OrderShipping | null
    lines: readonly PaidLine[]
    /** Line names as Stripe shows them, in the same order as `lines`. */
    titles: readonly string[]
  },
): Promise<OwnerAlert> {
  const productIds = [...new Set(order.lines.map((l) => l.product_id).filter((id): id is string => !!id))]
  let lowStock: LowStock[] = []
  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, title, inventory_count, variants:product_variants(id, size, inventory_count)')
      .in('id', productIds)
    // Stock is a bonus line in the alert; the order itself must still be announced.
    if (error) console.error('Owner alert: stock not read', error)
    else lowStock = lowStockAfter(order.lines, (data ?? []) as StockRow[])
  }

  const address = order.shipping?.address
  const place = [address?.city, address?.country].filter(Boolean).join(', ') || null

  return {
    kind: 'order',
    orderId: order.id,
    total: order.total,
    email: order.email,
    place,
    lines: order.lines.map((l, i) => ({ title: order.titles[i] ?? 'Item', quantity: l.quantity, size: l.variant_label })),
    lowStock,
  }
}
