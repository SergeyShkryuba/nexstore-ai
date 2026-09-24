'use client'

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAX_VARIANTS } from '@/lib/variants'

export type SizeRow = { size: string; inventory_count: number }

const PRESET = ['S', 'M', 'L', 'XL']

/**
 * The product's sizes and the stock of each, in display order. Submitted as
 * one JSON field ("variants"); an empty list means the product is sold
 * without sizes. Validation happens again on the server.
 */
export function SizesEditor({ rows, onChange }: { rows: SizeRow[]; onChange: (rows: SizeRow[]) => void }) {
  const update = (i: number, patch: Partial<SizeRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  const move = (from: number, to: number) => {
    const next = [...rows]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    onChange(next)
  }

  const addPreset = () => {
    const have = new Set(rows.map((r) => r.size.toLowerCase()))
    onChange([...rows, ...PRESET.filter((s) => !have.has(s.toLowerCase())).map((size) => ({ size, inventory_count: 0 }))])
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="variants" value={JSON.stringify(rows)} />

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_7rem_auto] gap-2 text-xs font-medium text-muted-foreground">
            <span>Size</span>
            <span>Stock</span>
            <span className="sr-only">Actions</span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
              <Input
                value={row.size}
                maxLength={20}
                required
                aria-label={`Size ${i + 1} name`}
                onChange={(e) => update(i, { size: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step={1}
                value={row.inventory_count}
                aria-label={`Stock of size ${row.size || i + 1}`}
                onChange={(e) => update(i, { inventory_count: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              />
              <div className="flex">
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move size ${row.size} up`}>
                  <ChevronUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move size ${row.size} down`}>
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  aria-label={`Remove size ${row.size}`}
                >
                  <X />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_VARIANTS}
          onClick={() => onChange([...rows, { size: '', inventory_count: 0 }])}
        >
          <Plus /> Add size
        </Button>
        {PRESET.some((p) => !rows.some((r) => r.size.toLowerCase() === p.toLowerCase())) && (
          <Button type="button" variant="outline" size="sm" onClick={addPreset}>
            <Plus /> S · M · L · XL
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length > 0
          ? 'Shoppers pick a size before adding to the cart. Each size keeps its own stock; the product total is their sum.'
          : 'No sizes: the product is sold as one item with the stock above.'}
      </p>
    </div>
  )
}
