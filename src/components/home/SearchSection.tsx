'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Loader2, ImageOff } from 'lucide-react'
import { ProductCard } from '@/components/product/ProductCard'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSuggestions } from './useSuggestions'
import type { Suggestion } from '@/app/api/search/suggest/route'

const HERO_IMAGE = 'https://images.unsplash.com/photo-1592683855405-3f272c7e462a?w=2000&q=75'

export type SearchProduct = {
  id: string
  title: string
  slug: string
  price: number
  image_urls: string[] | null
  inventory_count?: number | null
}

type SearchResponse = {
  query: string
  maxPrice: number | null
  results: Array<{
    product: SearchProduct
    score: number
    matchedTerms: string[]
    similarity: number | null
  }>
  strategy: 'hybrid' | 'lexical'
  took_ms: number
}

const STRATEGY_LABEL: Record<SearchResponse['strategy'], string> = {
  hybrid: 'semantic + keyword ranking',
  // Shown when the embedding service did not answer: say so rather than pretend.
  lexical: 'keyword ranking only',
}

// The last two name no product: they only work because search matches meaning.
const EXAMPLES = [
  'wireless headphones',
  'smart home under 60',
  'something to keep me warm in winter',
  'film my surfing trip',
]

export function SearchSection() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<SearchResponse | null>(null)

  // Type-ahead: open while the shopper types, closed on submit, Escape or blur.
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const suggestions = useSuggestions(query, suggestOpen)
  const showSuggestions = suggestOpen && suggestions.length > 0
  const active = activeIndex < suggestions.length ? activeIndex : -1

  const openProduct = (suggestion: Suggestion) => {
    setSuggestOpen(false)
    router.push(`/product/${suggestion.slug}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSuggestOpen(false)
      return
    }
    if (!showSuggestions) return
    // -1 is "nothing highlighted" (the input itself); the arrows wrap through it.
    const last = suggestions.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(active === last ? -1 : active + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(active === -1 ? last : active - 1)
    } else if (e.key === 'Enter' && active >= 0) {
      // Enter on a highlighted suggestion opens it; otherwise it runs the full search.
      e.preventDefault()
      openProduct(suggestions[active])
    }
  }

  const runSearch = async (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed.length < 2) return

    setSuggestOpen(false)
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
    <section className="w-full space-y-12">
      <div className="relative isolate rounded-3xl border">
        {/* Clipped in its own layer so the suggestions list can overflow the hero. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
          <Image src={HERO_IMAGE} alt="" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-b from-background/55 via-background/70 to-background/95" />
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 py-16 md:py-24 text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Search the catalogue <span className="text-primary">in your own words</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Describe what you need — even without the product&apos;s name, and with a budget like
            &ldquo;under 60&rdquo; — and search matches it by meaning as well as by keywords.
          </p>

          <div className="relative">
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
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions}
                  aria-controls="search-suggestions"
                  aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSuggestOpen(true)
                    setActiveIndex(-1)
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setSuggestOpen(false)}
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

            {showSuggestions && (
              <ul
                id="search-suggestions"
                role="listbox"
                aria-label="Suggested products"
                // Keep focus in the input so a click is not lost to its blur.
                onMouseDown={(e) => e.preventDefault()}
                className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border bg-popover text-left text-popover-foreground shadow-xl"
              >
                {suggestions.map((suggestion, i) => (
                  <li
                    key={suggestion.id}
                    id={`suggestion-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onClick={() => openProduct(suggestion)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2',
                      i === active && 'bg-muted',
                    )}
                  >
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {suggestion.image_url ? (
                        <Image src={suggestion.image_url} alt="" fill sizes="40px" className="object-cover" />
                      ) : (
                        <ImageOff aria-hidden="true" className="m-auto mt-2.5 size-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="flex-1 truncate">{suggestion.title}</span>
                    <span className="text-sm text-muted-foreground">{formatPrice(suggestion.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-muted-foreground">Try:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExample(example)}
                className="rounded-full border bg-background/70 px-3 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
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
              {STRATEGY_LABEL[response.strategy]} · {response.took_ms} ms
              {response.maxPrice !== null && ` · budget ≤ €${response.maxPrice}`}
            </p>
          </div>

          {response.results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {response.results.map(({ product, matchedTerms, similarity }) => (
                <div key={product.id} className="space-y-2">
                  <ProductCard product={{ ...product, image_urls: product.image_urls ?? [] }} />
                  <p className="text-xs text-muted-foreground px-1">
                    {matchedTerms.length > 0
                      ? `matched: ${matchedTerms.join(', ')}`
                      : 'matched by meaning'}
                    {similarity !== null && ` · similarity ${similarity.toFixed(2)}`}
                  </p>
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
