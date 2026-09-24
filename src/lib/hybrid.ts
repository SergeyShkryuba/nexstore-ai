/**
 * Hybrid ranking: merges the lexical ranker with nearest-neighbour matches.
 *
 * The two scores live on unrelated scales (field-weighted term counts vs.
 * cosine similarity), so they are not added. Reciprocal rank fusion scores each
 * product by its position in each list instead: 1 / (k + rank), summed. A
 * product both rankers agree on rises to the top; one found by only one of
 * them still appears.
 *
 * Pure module, like `search.ts`: no database, testable with plain data.
 */

import type { ScoredProduct, SearchableProduct } from './search'

export type SemanticMatch = { id: string; similarity: number }

export type HybridResult<T extends SearchableProduct = SearchableProduct> = ScoredProduct<T> & {
  /** Cosine similarity to the query; null when only the lexical ranker found it. */
  similarity: number | null
}

export type FuseOptions = {
  /** Budget parsed from the query; semantic matches above it are dropped too. */
  maxPrice: number | null
  /**
   * Semantic matches below this similarity are noise, not results. gte-small
   * scores almost any two product texts above 0.7, so the cut-off is high.
   */
  minSimilarity: number
  /**
   * Also drop matches further than this below the best match. An absolute
   * cut-off alone lets through near-misses on specific queries ("wireless
   * headphones" scores the thermostat at 0.81, the headphones at 0.92).
   */
  maxGap?: number
  /** RRF damping constant; 60 is the value from the original paper. */
  k?: number
  limit?: number
}

export function fuseResults<T extends SearchableProduct>(
  lexical: readonly ScoredProduct<T>[],
  semantic: readonly SemanticMatch[],
  products: readonly T[],
  options: FuseOptions,
): HybridResult<T>[] {
  const { maxPrice, minSimilarity, maxGap = Infinity, k = 60, limit = 24 } = options
  const byId = new Map(products.map((p) => [p.id, p]))

  const merged = new Map<string, HybridResult<T>>()

  lexical.forEach((result, rank) => {
    merged.set(result.product.id, {
      ...result,
      score: 1 / (k + rank + 1),
      similarity: null,
    })
  })

  // The gap is measured from the best match before the budget filter: an
  // over-budget best match still tells us how good "good" is for this query.
  const best = Math.max(-Infinity, ...semantic.map((m) => m.similarity))
  const cutOff = Math.max(minSimilarity, best - maxGap)

  const relevant = semantic
    .filter((m) => m.similarity >= cutOff)
    .filter((m) => {
      const product = byId.get(m.id)
      return product !== undefined && (maxPrice === null || product.price <= maxPrice)
    })
    .sort((a, b) => b.similarity - a.similarity)

  relevant.forEach((match, rank) => {
    const contribution = 1 / (k + rank + 1)
    const existing = merged.get(match.id)
    if (existing) {
      existing.score += contribution
      existing.similarity = match.similarity
    } else {
      merged.set(match.id, {
        product: byId.get(match.id)!,
        score: contribution,
        matchedTerms: [],
        similarity: match.similarity,
      })
    }
  })

  return [...merged.values()]
    .map((r) => ({
      ...r,
      score: Number(r.score.toFixed(5)),
      similarity: r.similarity === null ? null : Number(r.similarity.toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title))
    .slice(0, limit)
}
