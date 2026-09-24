'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProductCard } from '@/components/product/ProductCard'
import {
  applyFilters,
  buildFacets,
  toggleValue,
  type FacetValue,
  filtersToParams,
  hasActiveFilters,
  parseFilters,
  SORT_OPTIONS,
  type CatalogFilters,
  type SortKey,
} from '@/lib/catalog'

export type CatalogItem = {
  id: string
  title: string
  slug: string
  price: number
  image_urls: string[] | null
  inventory_count: number
  created_at: string
  attributes?: Record<string, unknown> | null
  variants?: { size: string; inventory_count: number; sort_order?: number | null }[] | null
}

const PAGE_SIZE = 12

const selectClassName =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function ProductGrid({ products }: { products: readonly CatalogItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

/**
 * Filter bar and results for a category page. Reads its state from the URL
 * (`useSearchParams`), so the page renders it inside a Suspense boundary whose
 * fallback is the unfiltered grid — crawlers and first paint still get every
 * product in the HTML.
 */
export function CatalogView({ products }: { products: readonly CatalogItem[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = useMemo(() => parseFilters(searchParams), [searchParams])
  // From the whole category, so options do not vanish as filters narrow it.
  const facets = useMemo(() => buildFacets(products), [products])
  const results = useMemo(() => applyFilters(products, filters), [products, filters])

  const update = (patch: Partial<CatalogFilters>) => {
    const query = filtersToParams({ ...filters, ...patch }).toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-sort">Sort by</Label>
          <select
            id="catalog-sort"
            className={selectClassName}
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as SortKey })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Keyed on the applied range so the drafts reset on back/forward and "Clear". */}
        <PriceRange
          key={`${filters.minPrice}-${filters.maxPrice}`}
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          onApply={(minPrice, maxPrice) => update({ minPrice, maxPrice })}
        />

        <label className="flex h-8 items-center gap-2 text-sm font-medium select-none">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={filters.inStock}
            onChange={(e) => update({ inStock: e.target.checked })}
          />
          In stock only
        </label>

        {hasActiveFilters(filters) && (
          <Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
            <X aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>

      {(facets.sizes.length > 0 || facets.attributes.length > 0) && (
        <div className="space-y-4 rounded-xl border p-4">
          {facets.sizes.length > 0 && (
            <FacetGroup
              label="Size"
              values={facets.sizes}
              selected={filters.sizes}
              onToggle={(value) => update({ sizes: toggleValue(filters.sizes, value) })}
            />
          )}
          {facets.attributes.map((facet) => (
            <FacetGroup
              key={facet.key}
              label={facet.label}
              values={facet.values}
              selected={filters.attributes[facet.key] ?? []}
              onToggle={(value) => {
                const next = toggleValue(filters.attributes[facet.key] ?? [], value)
                const attributes = { ...filters.attributes, [facet.key]: next }
                if (next.length === 0) delete attributes[facet.key]
                update({ attributes })
              }}
            />
          ))}
        </div>
      )}

      <Results key={searchParams.toString()} products={results} total={products.length} />
    </div>
  )
}

function PriceRange({
  minPrice,
  maxPrice,
  onApply,
}: {
  minPrice: number | null
  maxPrice: number | null
  onApply: (minPrice: number | null, maxPrice: number | null) => void
}) {
  const [min, setMin] = useState(minPrice?.toString() ?? '')
  const [max, setMax] = useState(maxPrice?.toString() ?? '')

  const toPrice = (raw: string) => {
    const value = Number(raw)
    return raw.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null
  }

  const apply = () => {
    const nextMin = toPrice(min)
    const nextMax = toPrice(max)
    if (nextMin !== minPrice || nextMax !== maxPrice) onApply(nextMin, nextMax)
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
      // Enter is handled directly rather than left to implicit form submission,
      // which not every browser or automation driver performs.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault()
          apply()
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-min">Min price, €</Label>
        <Input
          id="catalog-min"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="0"
          className="w-24"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={apply}
        />
      </div>
      <span className="pb-1.5 text-muted-foreground" aria-hidden="true">
        –
      </span>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-max">Max price, €</Label>
        <Input
          id="catalog-max"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="Any"
          className="w-24"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={apply}
        />
      </div>
      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  )
}

/** Keyed on the query string, so "Show more" starts over whenever the filters change. */
function Results({ products, total }: { products: CatalogItem[]; total: number }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const shown = products.slice(0, limit)

  return (
    <>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {products.length === total
          ? `${total} ${total === 1 ? 'product' : 'products'}`
          : `${products.length} of ${total} products match`}
      </p>

      {products.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No products match these filters.
        </p>
      ) : (
        <ProductGrid products={shown} />
      )}

      {products.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" size="lg" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show more ({products.length - limit} left)
          </Button>
        </div>
      )}
    </>
  )
}

/** One filter group: toggle chips; any selected value within the group matches. */
function FacetGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string
  values: FacetValue[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="float-left mr-2 w-24 shrink-0 text-sm font-medium">{label}</legend>
      {values.map(({ value, count }) => {
        const on = selected.includes(value)
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {value}
            <span className={cn('ml-1.5 text-xs', on ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>
          </button>
        )
      })}
    </fieldset>
  )
}
