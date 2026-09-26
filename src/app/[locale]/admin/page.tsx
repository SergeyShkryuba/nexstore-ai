import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RevenueChart } from '@/components/admin/RevenueChart'
import { Link } from '@/i18n/navigation'
import { formatPrice } from '@/lib/format'
import { ORDER_STATUSES } from '@/lib/orders'
import {
  PERIODS,
  change,
  comparisonStart,
  lowStock,
  parsePeriod,
  summarize,
  type AnalyticsOrder,
  type StockProduct,
} from '@/lib/analytics'
import { cn } from '@/lib/utils'

type Props = { searchParams: Promise<{ days?: string | string[] }> }

export default async function AdminDashboardPage({ searchParams }: Props) {
  const days = parsePeriod((await searchParams).days)
  const supabase = await createClient()

  // Two periods back, for the comparison. Admins read every order through RLS.
  const since = comparisonStart(days).toISOString()
  const [ordersResult, productsResult, supportResult] = await Promise.all([
    supabase
      .from('orders')
      .select('created_at, status, total_amount, order_items(quantity, unit_price, product:products(id, title, slug))')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000),
    supabase.from('products').select('id, title, inventory_count, variants:product_variants(size, inventory_count, sort_order)'),
    supabase.from('support_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  const summary = summarize((ordersResult.data ?? []) as unknown as AnalyticsOrder[], days)
  const low = lowStock((productsResult.data ?? []) as StockProduct[])
  const placed = ORDER_STATUSES.reduce((n, s) => n + summary.statusCounts[s], 0)
  const topRevenue = summary.topProducts[0]?.revenue ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Sales, stock and support at a glance. Revenue counts paid, shipped and delivered orders.
        </p>
      </div>

      {/* One filter row, scoping everything below it. */}
      <nav aria-label="Period" className="flex gap-1">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin?days=${p}`}
            aria-current={p === days ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              p === days ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Last {p} days
          </Link>
        ))}
      </nav>

      {ordersResult.error && <p className="text-destructive">Could not load orders: {ordersResult.error.message}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          label="Revenue"
          value={formatPrice(summary.current.revenue)}
          delta={change(summary.current.revenue, summary.previous.revenue)}
          days={days}
        />
        <StatTile
          label="Paid orders"
          value={String(summary.current.orders)}
          delta={change(summary.current.orders, summary.previous.orders)}
          days={days}
        />
        <StatTile
          label="Average order"
          value={formatPrice(summary.current.averageOrder)}
          delta={change(summary.current.averageOrder, summary.previous.averageOrder)}
          days={days}
        />
        <StatTile
          label="Open support requests"
          value={String(supportResult.count ?? 0)}
          footer={
            <Link href="/admin/support" className="underline underline-offset-4">
              Open support
            </Link>
          }
        />
        <StatTile
          label="Low stock"
          value={String(low.length)}
          footer={<span>{low.length === 1 ? 'item' : 'items'} at 5 or fewer</span>}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue per day</CardTitle>
          <p className="text-sm text-muted-foreground">Last {days} days, UTC</p>
        </CardHeader>
        <CardContent>
          <RevenueChart days={summary.daily} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <p className="text-sm text-muted-foreground">By revenue, last {days} days</p>
          </CardHeader>
          <CardContent>
            {summary.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Product</th>
                    <th className="pb-2 text-right font-medium">Units</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topProducts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 pr-4">
                        <Link href={`/product/${p.slug}`} className="hover:underline">
                          {p.title}
                        </Link>
                        {/* Share of the best seller, as a thin bar under the name. */}
                        <span className="mt-1 block h-1 rounded-full bg-muted" aria-hidden="true">
                          <span
                            className="block h-1 rounded-full bg-primary"
                            style={{ width: `${topRevenue ? (p.revenue / topRevenue) * 100 : 0}%` }}
                          />
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.units}</td>
                      <td className="py-2 text-right tabular-nums">{formatPrice(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders by status</CardTitle>
            <p className="text-sm text-muted-foreground">
              {placed} placed in the last {days} days
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {ORDER_STATUSES.map((status) => {
                const count = summary.statusCounts[status]
                return (
                  <li key={status} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3">
                    <span className="capitalize">{status}</span>
                    <span className="h-2 rounded-full bg-muted" aria-hidden="true">
                      <span
                        className="block h-2 rounded-full bg-primary"
                        style={{ width: `${placed ? (count / placed) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums">{count}</span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Low stock</CardTitle>
          <p className="text-sm text-muted-foreground">Products and sizes with 5 or fewer left, emptiest first</p>
        </CardHeader>
        <CardContent>
          {low.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything is well stocked.</p>
          ) : (
            <ul className="divide-y text-sm">
              {low.map((item) => (
                <li key={`${item.id}-${item.size ?? ''}`} className="flex items-center justify-between gap-4 py-2">
                  <Link href={`/admin/products/${item.id}/edit`} className="hover:underline">
                    {item.title}
                    {item.size && <span className="text-muted-foreground"> · size {item.size}</span>}
                  </Link>
                  <span
                    className={cn(
                      'tabular-nums',
                      item.left === 0 ? 'font-medium text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {item.left === 0 ? 'Sold out' : `${item.left} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** A figure with its change against the previous period of the same length. */
function StatTile({
  label,
  value,
  delta,
  days,
  footer,
}: {
  label: string
  value: string
  delta?: number | null
  days?: number
  footer?: ReactNode
}) {
  const Icon = !delta ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold">{value}</p>
        {delta !== undefined && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {delta === null ? (
              <span>No sales in the {days} days before</span>
            ) : (
              <>
                <Icon
                  className={cn(
                    'size-3.5',
                    delta > 0 && 'text-green-600 dark:text-green-400',
                    delta < 0 && 'text-destructive',
                  )}
                  aria-hidden="true"
                />
                <span>
                  {delta > 0 ? '+' : ''}
                  {Math.round(delta * 100)}% vs previous {days} days
                </span>
              </>
            )}
          </p>
        )}
        {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  )
}
