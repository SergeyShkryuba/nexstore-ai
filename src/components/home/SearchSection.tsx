'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Loader2 } from 'lucide-react'
import { ProductCard } from '@/components/product/ProductCard'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export type SearchProduct = {
  id: string
  title: string
  slug: string
  price: number
  image_urls: string[] | null
}

type SearchResponse = {
  query: string
  maxPrice: number | null
  results: Array<{ product: SearchProduct; score: number; matchedTerms: string[] }>
  strategy: 'lexical'
  took_ms: number
}

const EXAMPLES = ['wireless headphones', 'red sweater for winter', 'smart home under 60']

export function SearchSection() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<SearchResponse | null>(null)

  const runSearch = async (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed.length < 2) return

    setIsLoading(true)
    setResponse(null)

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data?.error ?? 'Search failed')
        return
      }

      setResponse(data as SearchResponse)
    } catch (error) {
      console.error('Search failed', error)
      toast.error('Search failed', { description: 'Please try again later.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void runSearch(query)
  }

  const handleExample = (example: string) => {
    setQuery(example)
    void runSearch(example)
  }

  return (
    <section className="w-full flex flex-col items-center max-w-5xl mx-auto space-y-12">
      <div className="w-full max-w-2xl text-center space-y-6">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          Search the catalogue <span className="text-primary">in your own words</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Type what you need — including a budget, like &ldquo;smart home under 60&rdquo; — and the
          ranker scores every product against it.
        </p>

        <form
          onSubmit={handleSubmit}
          role="search"
          className="relative w-full flex shadow-lg rounded-lg overflow-hidden border"
        >
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-4 top-3.5 h-6 w-6 text-muted-foreground"
            />
            <label htmlFor="catalogue-search" className="sr-only">
              Search products
            </label>
            <Input
              id="catalogue-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., noise cancelling headphones under 300"
              className="w-full pl-12 h-14 text-lg border-0 focus-visible:ring-0 rounded-none bg-background"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || query.trim().length < 2}
            className="h-14 px-8 rounded-none text-lg"
          >
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" aria-label="Searching" /> : 'Search'}
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExample(example)}
              className="rounded-full border px-3 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      )}

      {response && !isLoading && (
        <div
          className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
            <h2 className="text-2xl font-bold">
              {response.results.length > 0
                ? `${response.results.length} ${response.results.length === 1 ? 'result' : 'results'}`
                : 'No matches'}
            </h2>
            <p className="text-sm text-muted-foreground">
              lexical ranking · {response.took_ms} ms
              {response.maxPrice !== null && ` · budget ≤ €${response.maxPrice}`}
            </p>
          </div>

          {response.results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {response.results.map(({ product, matchedTerms }) => (
                <div key={product.id} className="space-y-2">
                  <ProductCard product={{ ...product, image_urls: product.image_urls ?? [] }} />
                  {matchedTerms.length > 0 && (
                    <p className="text-xs text-muted-foreground px-1">
                      matched: {matchedTerms.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-lg">
              Nothing in the catalogue matches that. Try fewer words, or raise the budget.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
