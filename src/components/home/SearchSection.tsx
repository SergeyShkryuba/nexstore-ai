'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Loader2, ExternalLink } from 'lucide-react'
import { ProductCard } from '@/components/product/ProductCard'
import Link from 'next/link'

type SearchResult = {
  local: any[]
  global: any[]
}

export function SearchSection() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<SearchResult | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsLoading(true)
    setResults(null)
    
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setResults(data)
    } catch (error) {
      console.error("Search failed", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center max-w-5xl mx-auto space-y-12">
      <div className="w-full max-w-2xl text-center space-y-6">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          Smart search powered by <span className="text-primary">AI</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Describe what you're looking for in your own words. We'll find it in our store or across the web.
        </p>
        
        <form onSubmit={handleSearch} className="relative w-full flex shadow-lg rounded-lg overflow-hidden border">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 h-6 w-6 text-muted-foreground" />
            <Input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., A red sweater for a Christmas party..." 
              className="w-full pl-12 h-14 text-lg border-0 focus-visible:ring-0 rounded-none bg-background"
            />
          </div>
          <Button type="submit" disabled={isLoading || !query.trim()} className="h-14 px-8 rounded-none text-lg">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Search'}
          </Button>
        </form>
      </div>

      {results && (
        <div className="w-full space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-500">
          
          <div className="space-y-6">
            <h2 className="text-3xl font-bold border-b pb-2">🛍️ In Our Store</h2>
            {results.local.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                {results.local.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-lg">Nothing found in our local catalog for this query.</p>
            )}
          </div>

          <div className="space-y-6 bg-muted/30 p-8 rounded-2xl border border-border/50">
            <h2 className="text-3xl font-bold flex items-center gap-2">
              🌐 Found Across the Web
            </h2>
            <p className="text-muted-foreground">Search results from external marketplaces via our global aggregator.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {results.global.map((extItem) => (
                <Card key={extItem.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0 flex h-32">
                    <div className="w-32 h-full bg-muted flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={extItem.image_url} alt={extItem.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-4 flex flex-col flex-1 justify-between">
                      <div>
                        <h3 className="font-semibold line-clamp-1">{extItem.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">Source: {extItem.source}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-lg">${extItem.price.toFixed(2)}</span>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={extItem.url} target="_blank" rel="noreferrer">
                            View Deal <ExternalLink className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
