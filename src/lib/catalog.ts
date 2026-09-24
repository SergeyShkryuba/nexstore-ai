/**
 * Category-page filtering and sorting.
 *
 * Pure module, like `search.ts`: the category page is prerendered with the full
 * list, and the filters run in the browser against that list with their state
 * kept in the URL. That keeps the catalogue static (ISR) while every filtered
 * view is still a shareable link.
 */

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name'

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A–Z' },
]

export const DEFAULT_SORT: SortKey = 'newest'

export type CatalogFilters = {
  sort: SortKey
  minPrice: number | null
  maxPrice: number | null
  inStock: boolean
}

export type CatalogProduct = {
  id: string
  title: string
  price: number | string
  inventory_count?: number | null
  created_at?: string | null
}

type ParamReader = { get(name: string): string | null }

function parsePrice(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
}

/** Reads filters from the URL. Anything malformed falls back to the default. */
export function parseFilters(params: ParamReader): CatalogFilters {
  const sort = params.get('sort')
  let minPrice = parsePrice(params.get('min'))
  let maxPrice = parsePrice(params.get('max'))
  // A reversed range is a typo, not a request for nothing.
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    ;[minPrice, maxPrice] = [maxPrice, minPrice]
  }
  return {
    sort: isSortKey(sort) ? sort : DEFAULT_SORT,
    minPrice,
    maxPrice,
    inStock: params.get('stock') === '1',
  }
}

/** Inverse of `parseFilters`. Defaults are omitted so the plain URL stays clean. */
export function filtersToParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  if (filters.minPrice !== null) params.set('min', String(filters.minPrice))
  if (filters.maxPrice !== null) params.set('max', String(filters.maxPrice))
  if (filters.inStock) params.set('stock', '1')
  return params
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return filtersToParams(filters).toString() !== ''
}

const byTitle = new Intl.Collator('en', { sensitivity: 'base' })

export function applyFilters<T extends CatalogProduct>(
  products: readonly T[],
  filters: CatalogFilters,
): T[] {
  const result = products.filter((product) => {
    const price = Number(product.price)
    if (filters.minPrice !== null && price < filters.minPrice) return false
    if (filters.maxPrice !== null && price > filters.maxPrice) return false
    if (filters.inStock && (product.inventory_count ?? 0) <= 0) return false
    return true
  })

  const compare: Record<SortKey, (a: T, b: T) => number> = {
    newest: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    'price-asc': (a, b) => Number(a.price) - Number(b.price),
    'price-desc': (a, b) => Number(b.price) - Number(a.price),
    name: (a, b) => byTitle.compare(a.title, b.title),
  }

  // Title as a tie-breaker keeps the order stable between renders.
  return result.sort(
    (a, b) => compare[filters.sort](a, b) || byTitle.compare(a.title, b.title),
  )
}
