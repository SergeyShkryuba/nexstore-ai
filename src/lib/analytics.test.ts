import { describe, it, expect } from 'vitest'
import { change, lowStock, niceTicks, parsePeriod, summarize, type AnalyticsOrder } from './analytics'

const NOW = new Date('2026-09-26T15:00:00Z')

const sweater = { id: 'p-sweater', title: 'Sweater', slug: 'sweater' }
const lamp = { id: 'p-lamp', title: 'Lamp', slug: 'lamp' }

const order = (created_at: string, status: string, total: number, items: AnalyticsOrder['order_items'] = []): AnalyticsOrder => ({
  created_at,
  status,
  total_amount: String(total),
  order_items: items,
})

describe('summarize', () => {
  const orders = [
    order('2026-09-26T09:00:00Z', 'paid', 80, [{ quantity: 2, unit_price: '40', product: sweater }]),
    order('2026-09-25T09:00:00Z', 'delivered', 30, [{ quantity: 1, unit_price: 30, product: lamp }]),
    order('2026-09-24T09:00:00Z', 'refunded', 500, [{ quantity: 1, unit_price: 500, product: lamp }]),
    order('2026-09-24T10:00:00Z', 'pending', 99),
    // The previous 7 days: 13–19 September.
    order('2026-09-19T23:00:00Z', 'shipped', 55),
    // Before both periods.
    order('2026-09-10T09:00:00Z', 'paid', 1000),
  ]

  it('counts only money taken: paid, shipped and delivered', () => {
    const s = summarize(orders, 7, NOW)
    expect(s.current).toEqual({ revenue: 110, orders: 2, averageOrder: 55 })
    expect(s.previous).toEqual({ revenue: 55, orders: 1, averageOrder: 55 })
  })

  it('has one day per calendar day of the period, empty days included', () => {
    const s = summarize(orders, 7, NOW)
    expect(s.daily.map((d) => d.date)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    ])
    expect(s.daily.at(-1)).toEqual({ date: '2026-09-26', revenue: 80, orders: 1 })
    expect(s.daily.find((d) => d.date === '2026-09-24')).toEqual({ date: '2026-09-24', revenue: 0, orders: 0 })
  })

  it('counts every order placed by status, refunded ones included', () => {
    expect(summarize(orders, 7, NOW).statusCounts).toEqual({
      pending: 1, paid: 1, shipped: 0, delivered: 1, cancelled: 0, refunded: 1,
    })
  })

  it('ranks products by the revenue they brought in, ignoring refunded orders', () => {
    expect(summarize(orders, 7, NOW).topProducts).toEqual([
      { ...sweater, units: 2, revenue: 80 },
      { ...lamp, units: 1, revenue: 30 },
    ])
  })
})

describe('helpers', () => {
  it('accepts only the offered periods', () => {
    expect(parsePeriod('7')).toBe(7)
    expect(parsePeriod(['90'])).toBe(90)
    expect(parsePeriod('365')).toBe(30)
    expect(parsePeriod(undefined)).toBe(30)
  })

  it('compares with the previous period, or says there is nothing to compare', () => {
    expect(change(150, 100)).toBeCloseTo(0.5)
    expect(change(50, 100)).toBeCloseTo(-0.5)
    expect(change(10, 0)).toBeNull()
  })

  it('rounds the axis up to clean steps', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(94.6)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(1830)).toEqual([0, 500, 1000, 1500, 2000])
  })

  it('lists sizes and unsized products at or under the mark, emptiest first', () => {
    expect(
      lowStock([
        { id: 'a', title: 'Tee', inventory_count: 12, variants: [
          { size: 'S', inventory_count: 0, sort_order: 0 },
          { size: 'M', inventory_count: 12, sort_order: 1 },
        ] },
        { id: 'b', title: 'Lamp', inventory_count: 3, variants: [] },
        { id: 'c', title: 'Camera', inventory_count: 40, variants: null },
      ]),
    ).toEqual([
      { id: 'a', title: 'Tee', size: 'S', left: 0 },
      { id: 'b', title: 'Lamp', size: null, left: 3 },
    ])
  })
})
