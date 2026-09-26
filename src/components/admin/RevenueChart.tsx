'use client'

import { useState } from 'react'
import { niceTicks, type DayPoint } from '@/lib/analytics'
import { formatPrice } from '@/lib/format'

const HEIGHT = 200
/** Room left of the plot for the y-axis ticks. */
const AXIS_WIDTH = 56
const MAX_BAR = 24
const GAP = 2

const dayFormatter = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatDay = (date: string) => dayFormatter.format(new Date(`${date}T00:00:00Z`))

const compactEuro = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/**
 * Revenue per day as columns: one series, so no legend (the card title names
 * it). Each column is its own hover and focus target; every value is also in
 * the table below the chart.
 */
export function RevenueChart({ days }: { days: DayPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const ticks = niceTicks(Math.max(...days.map((d) => d.revenue), 0))
  const top = ticks.at(-1) || 1
  const slot = 100 / days.length
  const current = active === null ? null : days[active]

  // Label the first and last day, plus a few between, never every one.
  const labelEvery = Math.ceil(days.length / 6)
  const labelled = (i: number) => i === 0 || i === days.length - 1 || (i % labelEvery === 0 && days.length - 1 - i >= labelEvery / 2)

  return (
    <div>
      <div className="relative" style={{ height: HEIGHT + 24 }}>
        {/* Gridlines and y-axis ticks: hairline, solid, recessive. */}
        {ticks.map((tick) => {
          const y = HEIGHT - (tick / top) * HEIGHT
          return (
            <div key={tick} className="absolute inset-x-0 flex items-center" style={{ top: y - 8 }} aria-hidden="true">
              <span className="w-14 shrink-0 pr-2 text-right text-xs tabular-nums text-muted-foreground">
                {compactEuro.format(tick)}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )
        })}

        <div
          className="absolute bottom-6 right-0 top-0 flex items-end"
          style={{ left: AXIS_WIDTH }}
          onPointerLeave={() => setActive(null)}
        >
          {days.map((day, i) => {
            const height = (day.revenue / top) * HEIGHT
            return (
              <button
                key={day.date}
                type="button"
                className="group relative flex h-full items-end justify-center focus-visible:outline-none"
                style={{ width: `${slot}%`, paddingInline: GAP / 2 }}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${formatDay(day.date)}: ${formatPrice(day.revenue)}, ${day.orders} ${day.orders === 1 ? 'order' : 'orders'}`}
              >
                {day.revenue > 0 && (
                  <span
                    className="block w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{ height: Math.max(height, 2), maxWidth: MAX_BAR }}
                  />
                )}
                {labelled(i) && (
                  <span className="absolute -bottom-6 whitespace-nowrap text-xs text-muted-foreground" aria-hidden="true">
                    {formatDay(day.date)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {current && active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
            style={{
              left: `calc(${AXIS_WIDTH}px + (100% - ${AXIS_WIDTH}px) * ${(active + 0.5) / days.length})`,
              top: 0,
            }}
            // The focused column's own label already says this to screen readers.
            aria-hidden="true"
          >
            <p className="text-sm font-semibold">{formatPrice(current.revenue)}</p>
            <p className="text-muted-foreground">
              {formatDay(current.date)} · {current.orders} {current.orders === 1 ? 'order' : 'orders'}
            </p>
          </div>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Orders</th>
              <th className="py-1 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {days
              .filter((d) => d.orders > 0)
              .map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="py-1">{formatDay(d.date)}</td>
                  <td className="py-1 text-right">{d.orders}</td>
                  <td className="py-1 text-right">{formatPrice(d.revenue)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
