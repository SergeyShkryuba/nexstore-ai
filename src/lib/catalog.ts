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
  /** Any of these sizes, in stock. */
  sizes: string[]
  /** Attribute key → accepted values: any value within a key, every key. */
  attributes: Record<string, string[]>
}

export type CatalogProduct = {
  id: string
  title: string
  price: number | string
  inventory_count?: number | null
  created_at?: string | null
  attributes?: Record<string, unknown> | null
  variants?: { size: string; inventory_count: number }[] | null
}

type ParamReader = {
  get(name: string): string | null
  getAll(name: string): string[]
  forEach(callback: (value: string, key: string) => void): void
}

/** Attribute filters live under "a.<key>" so they never clash with sort/min/max/stock/size. */
const ATTRIBUTE_PREFIX = 'a.'
const ATTRIBUTE_KEY = /^[a-z0-9_]{1,40}$/i
/** Keys come from the URL: these would reach Object.prototype instead of the filter. */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isAttributeKey(key: string): boolean {
  return ATTRIBUTE_KEY.test(key) && !RESERVED_KEYS.has(key)
}
const MAX_VALUES = 20

function parsePrice(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
}

function cleanValues(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v !== '' && v.length <= 60))].slice(0, MAX_VALUES)
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

  const attributes: Record<string, string[]> = {}
  params.forEach((_, name) => {
    if (!name.startsWith(ATTRIBUTE_PREFIX)) return
    const key = name.slice(ATTRIBUTE_PREFIX.length)
    if (!isAttributeKey(key) || Object.hasOwn(attributes, key)) return
    const values = cleanValues(params.getAll(name))
    if (values.length > 0) attributes[key] = values
  })

  return {
    sort: isSortKey(sort) ? sort : DEFAULT_SORT,
    minPrice,
    maxPrice,
    inStock: params.get('stock') === '1',
    sizes: cleanValues(params.getAll('size')),
    attributes,
  }
}

/** Inverse of `parseFilters`. Defaults are omitted so the plain URL stays clean. */
export function filtersToParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  if (filters.minPrice !== null) params.set('min', String(filters.minPrice))
  if (filters.maxPrice !== null) params.set('max', String(filters.maxPrice))
  if (filters.inStock) params.set('stock', '1')
  for (const size of filters.sizes) params.append('size', size)
  for (const key of Object.keys(filters.attributes).sort()) {
    for (const value of filters.attributes[key]) params.append(`${ATTRIBUTE_PREFIX}${key}`, value)
  }
  return params
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return filtersToParams(filters).toString() !== ''
}

/** Adds or removes one value from a list — for toggle chips. */
export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

function attributeValue(product: CatalogProduct, key: string): string | null {
  const value = product.attributes?.[key]
  return value === null || value === undefined || typeof value === 'object' ? null : String(value)
}

export function applyFilters<T extends CatalogProduct>(
  products: readonly T[],
  filters: CatalogFilters,
): T[] {
  const result = products.filter((product) => {
    const price = Number(product.price)
    if (filters.minPrice !== null && price < filters.minPrice) return false
    if (filters.maxPrice !== null && price > filters.maxPrice) return false
    if (filters.inStock && (product.inventory_count ?? 0) <= 0) return false
    if (
      filters.sizes.length > 0 &&
      !(product.variants ?? []).some((v) => v.inventory_count > 0 && filters.sizes.includes(v.size))
    ) {
      return false
    }
    for (const [key, values] of Object.entries(filters.attributes)) {
      const value = attributeValue(product, key)
      if (value === null || !values.includes(value)) return false
    }
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

// ---------------------------------------------------------------- Facets ----

export type FacetValue = { value: string; count: number }
export type Facet = { key: string; label: string; values: FacetValue[] }

/** Clothing sizes in wearing order; anything else sorts after, naturally. */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.toUpperCase())
  return i === -1 ? SIZE_ORDER.length : i
}

export function humanizeKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A facet is only worth showing when it actually splits the list. */
const MAX_FACET_VALUES = 12

/**
 * Filter options for a list of products: the sizes in stock, and every
 * attribute with at least two different values across at least two products.
 * Counts are products, not units.
 */
export function buildFacets(products: readonly CatalogProduct[]): { sizes: FacetValue[]; attributes: Facet[] } {
  const sizeCounts = new Map<string, number>()
  for (const product of products) {
    const inStock = new Set((product.variants ?? []).filter((v) => v.inventory_count > 0).map((v) => v.size))
    for (const size of inStock) sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1)
  }
  const sizes = [...sizeCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => sizeRank(a.value) - sizeRank(b.value) || byTitle.compare(a.value, b.value))

  const byKey = new Map<string, Map<string, number>>()
  for (const product of products) {
    for (const key of Object.keys(product.attributes ?? {})) {
      if (!isAttributeKey(key)) continue
      const value = attributeValue(product, key)
      if (value === null || value.trim() === '') continue
      const counts = byKey.get(key) ?? new Map<string, number>()
      counts.set(value, (counts.get(value) ?? 0) + 1)
      byKey.set(key, counts)
    }
  }

  const attributes: Facet[] = [...byKey.entries()]
    .filter(([, counts]) => {
      const products = [...counts.values()].reduce((a, b) => a + b, 0)
      return counts.size >= 2 && counts.size <= MAX_FACET_VALUES && products >= 2
    })
    .map(([key, counts]) => ({
      key,
      label: humanizeKey(key),
      values: [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => byTitle.compare(a.value, b.value)),
    }))
    .sort((a, b) => byTitle.compare(a.label, b.label))

  return { sizes, attributes }
}
