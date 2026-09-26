/**
 * Store figures for the admin dashboard. Pure: order rows in, numbers out,
 * so what counts as revenue is decided (and tested) in one place.
 */
import { LOW_STOCK_THRESHOLD } from '@/lib/stock'
import { ORDER_STATUSES, orderStatusKey, type OrderStatus } from '@/lib/orders'

/** Periods the dashboard offers, in days. */
export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

export function parsePeriod(value: string | string[] | undefined): Period {
  const days = Number(Array.isArray(value) ? value[0] : value)
  return (PERIODS as readonly number[]).includes(days) ? (days as Period) : 30
}

/**
 * Money the store has actually taken. Pending orders are not paid yet, and
 * cancelled or refunded ones were given back.
 */
export const REVENUE_STATUSES: readonly OrderStatus[] = ['paid', 'shipped', 'delivered']

export type AnalyticsOrder = {
  created_at: string
  status: string
  total_amount: number | string
  order_items:
    | Array<{
        quantity: number
        unit_price: number | string
        product: { id: string; title: string; slug: string } | null
      }>
    | null
}

export type Totals = { revenue: number; orders: number; averageOrder: number }
export type DayPoint = { date: string; revenue: number; orders: number }
export type TopProduct = { id: string; title: string; slug: string; units: number; revenue: number }

export type Summary = {
  current: Totals
  previous: Totals
  /** One entry per calendar day (UTC) of the period, oldest first, empty days included. */
  daily: DayPoint[]
  /** Every order placed in the period, whatever became of it. */
  statusCounts: Record<OrderStatus, number>
  topProducts: TopProduct[]
}

const DAY_MS = 24 * 60 * 60 * 1000

const dayKey = (date: Date) => date.toISOString().slice(0, 10)
const money = (value: number) => Math.round(value * 100) / 100

function totals(orders: readonly AnalyticsOrder[]): Totals {
  const counted = orders.filter((o) => REVENUE_STATUSES.includes(orderStatusKey(o.status)))
  const revenue = money(counted.reduce((sum, o) => sum + Number(o.total_amount), 0))
  return { revenue, orders: counted.length, averageOrder: counted.length ? money(revenue / counted.length) : 0 }
}

/**
 * The period is the last `days` calendar days including today (UTC); the
 * previous period is the `days` before it, for the comparison.
 */
export function summarize(orders: readonly AnalyticsOrder[], days: number, now: Date = new Date()): Summary {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = today - (days - 1) * DAY_MS
  const previousStart = start - days * DAY_MS

  const inPeriod = orders.filter((o) => Date.parse(o.created_at) >= start)
  const inPrevious = orders.filter((o) => {
    const t = Date.parse(o.created_at)
    return t >= previousStart && t < start
  })

  const byDay = new Map<string, DayPoint>()
  for (let t = start; t <= today; t += DAY_MS) {
    const date = dayKey(new Date(t))
    byDay.set(date, { date, revenue: 0, orders: 0 })
  }

  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>
  const products = new Map<string, TopProduct>()

  for (const order of inPeriod) {
    const status = orderStatusKey(order.status)
    statusCounts[status] += 1
    if (!REVENUE_STATUSES.includes(status)) continue

    const day = byDay.get(dayKey(new Date(order.created_at)))
    if (day) {
      day.revenue = money(day.revenue + Number(order.total_amount))
      day.orders += 1
    }

    for (const item of order.order_items ?? []) {
      if (!item.product) continue
      const entry = products.get(item.product.id) ?? { ...item.product, units: 0, revenue: 0 }
      entry.units += item.quantity
      entry.revenue = money(entry.revenue + Number(item.unit_price) * item.quantity)
      products.set(item.product.id, entry)
    }
  }

  return {
    current: totals(inPeriod),
    previous: totals(inPrevious),
    daily: [...byDay.values()],
    statusCounts,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, 5),
  }
}

/** The start of the previous period: everything the dashboard needs is newer than this. */
export function comparisonStart(days: number, now: Date = new Date()): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(today - (2 * days - 1) * DAY_MS)
}

/** Change against the previous period, as a fraction; null when there is nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

export type StockProduct = {
  id: string
  title: string
  inventory_count: number
  variants: Array<{ size: string; inventory_count: number; sort_order: number | null }> | null
}

export type LowStockItem = { id: string; title: string; size: string | null; left: number }

/** Every product, or size of a sized product, at or under the low-stock mark; emptiest first. */
export function lowStock(products: readonly StockProduct[]): LowStockItem[] {
  const items: LowStockItem[] = []
  for (const p of products) {
    if (p.variants && p.variants.length > 0) {
      for (const v of p.variants) {
        if (v.inventory_count <= LOW_STOCK_THRESHOLD) items.push({ id: p.id, title: p.title, size: v.size, left: v.inventory_count })
      }
    } else if (p.inventory_count <= LOW_STOCK_THRESHOLD) {
      items.push({ id: p.id, title: p.title, size: null, left: p.inventory_count })
    }
  }
  return items.sort((a, b) => a.left - b.left || a.title.localeCompare(b.title))
}

/** A clean axis maximum and ticks for `max`: 0, 50, 100, 150 rather than 0, 47.3, 94.6. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => money(i * step))
}
