/**
 * Catalog search scoring.
 *
 * This is deliberately a pure module with no Supabase or Next.js imports: the
 * ranking is the part worth testing, and it should be testable without a
 * database or a running server. The route handler fetches rows and calls
 * `rankProducts`; everything below is plain data in, plain data out.
 *
 * The ranking is lexical (BM25-flavoured term weighting), not semantic. That is
 * an honest description of what it does — see README for what a real embedding
 * based search would need.
 */

export type SearchableProduct = {
  id: string
  title: string
  slug: string
  description: string | null
  price: number
  category_id: string | null
  image_urls: string[] | null
  attributes?: Record<string, unknown> | null
}

export type ScoredProduct<T extends SearchableProduct = SearchableProduct> = {
  product: T
  score: number
  /** Which query terms actually matched — used for the "why this result" hint. */
  matchedTerms: string[]
}

/** Words that carry no signal in a product query. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'для', 'find', 'for',
  'from', 'get', 'i', 'in', 'is', 'it', 'me', 'my', 'need', 'of', 'on', 'or',
  'some', 'that', 'the', 'this', 'to', 'want', 'with', 'looking',
])

/**
 * Very small English stemmer: enough to make "headphones" match "headphone"
 * and "running" match "run" without pulling in a stemming dependency.
 */
export function stem(word: string): string {
  let w = word

  // Plural forms first: "headphones" -> "headphone", not "headphon".
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && /(?:ss|ch|sh|x|z|s)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)

  // Then verb endings, on whatever is left.
  if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)

  return w
}

/** Split a free-text query into meaningful, stemmed terms. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem)
}

/** Parse an explicit budget out of the query: "under 200", "до 50 евро", "<100". */
export function extractMaxPrice(input: string): number | null {
  const patterns = [
    /(?:under|below|less than|cheaper than|max|up to|до)\s*\$?\s*(\d+(?:[.,]\d+)?)/i,
    /<\s*\$?\s*(\d+(?:[.,]\d+)?)/,
    /\$\s*(\d+(?:[.,]\d+)?)\s*(?:or less|and under|max)/i,
  ]
  for (const re of patterns) {
    const m = input.match(re)
    if (m) {
      const value = Number.parseFloat(m[1].replace(',', '.'))
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return null
}

/** Field weights — a title hit says far more than a description hit. */
const WEIGHTS = {
  title: 6,
  attributes: 3,
  description: 1.5,
  /** Bonus when the whole query appears verbatim in the title. */
  exactPhrase: 8,
  /** Bonus when the product sits in a category the query names. */
  category: 2.5,
} as const

function attributeText(attributes: Record<string, unknown> | null | undefined): string {
  if (!attributes) return ''
  return Object.entries(attributes)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(' ')
}

function countTermHits(haystackTokens: string[], term: string): number {
  return haystackTokens.filter((t) => t === term || t.startsWith(term)).length
}

export type RankOptions = {
  /** Slug -> id, so a query naming a category boosts that category's products. */
  categorySlugToId?: Record<string, string>
  /** Drop results scoring below this. Keeps "no results" an honest answer. */
  minScore?: number
  limit?: number
}

/**
 * Rank products against a free-text query.
 *
 * Returns an empty array when nothing is relevant. It never invents a result:
 * an empty catalogue answer is more useful to a shopper than a random product.
 */
export function rankProducts<T extends SearchableProduct>(
  query: string,
  products: readonly T[],
  options: RankOptions = {},
): ScoredProduct<T>[] {
  const { categorySlugToId = {}, minScore = 1, limit = 24 } = options

  const normalizedQuery = query.trim().toLowerCase()
  const terms = tokenize(normalizedQuery)
  if (terms.length === 0) return []

  const maxPrice = extractMaxPrice(query)

  // Categories whose slug words appear in the query, e.g. "smart home speaker".
  const boostedCategoryIds = new Set<string>()
  for (const [slug, id] of Object.entries(categorySlugToId)) {
    const slugTerms = tokenize(slug.replace(/-/g, ' '))
    if (slugTerms.length > 0 && slugTerms.every((t) => terms.includes(t))) {
      boostedCategoryIds.add(id)
    }
  }

  const scored: ScoredProduct<T>[] = []

  for (const product of products) {
    if (maxPrice !== null && product.price > maxPrice) continue

    const titleTokens = tokenize(product.title)
    const descriptionTokens = tokenize(product.description ?? '')
    const attributeTokens = tokenize(attributeText(product.attributes))

    let score = 0
    const matchedTerms: string[] = []

    for (const term of terms) {
      const titleHits = countTermHits(titleTokens, term)
      const attributeHits = countTermHits(attributeTokens, term)
      const descriptionHits = countTermHits(descriptionTokens, term)

      if (titleHits + attributeHits + descriptionHits === 0) continue

      matchedTerms.push(term)
      // Saturating counts: the second occurrence of a word is worth less than
      // the first, so a keyword-stuffed description cannot outrank a title hit.
      score += WEIGHTS.title * Math.min(titleHits, 2)
      score += WEIGHTS.attributes * Math.min(attributeHits, 2)
      score += WEIGHTS.description * Math.min(descriptionHits, 3)
    }

    if (product.title.toLowerCase().includes(normalizedQuery) && normalizedQuery.length > 2) {
      score += WEIGHTS.exactPhrase
    }

    if (product.category_id && boostedCategoryIds.has(product.category_id)) {
      // A category hint alone is not a match — it only lifts products that
      // already matched at least one term.
      if (matchedTerms.length > 0) score += WEIGHTS.category
    }

    // Reward coverage: matching 3 of 3 query terms beats matching 1 of 3.
    const coverage = matchedTerms.length / terms.length
    score *= 0.5 + 0.5 * coverage

    if (score >= minScore) {
      scored.push({ product, score: Number(score.toFixed(3)), matchedTerms })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title))
  return scored.slice(0, limit)
}
