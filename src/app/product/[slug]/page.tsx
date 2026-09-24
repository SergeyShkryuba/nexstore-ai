import { notFound } from 'next/navigation'
import { AddToCartButton } from '@/components/product/AddToCartButton'
import { ProductCard } from '@/components/product/ProductCard'
import { ProductGallery } from '@/components/product/ProductGallery'
import { ReviewSection } from '@/components/product/ReviewSection'
import { Star, Shield, Truck, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { createPublicClient } from '@/utils/supabase/public'
import { averageRating, formatPrice } from '@/lib/format'
import { productJsonLd, serializeJsonLd } from '@/lib/structured-data'
import { siteUrl } from '@/lib/site'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { stockLabel, stockLevel } from '@/lib/stock'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export const revalidate = 300

export async function generateStaticParams() {
  const supabase = createPublicClient()
  const { data } = await supabase.from('products').select('slug')
  return (data ?? []).map((p) => ({ slug: p.slug as string }))
}

interface ProductPageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data: product } = await supabase.from('products').select('*').eq('slug', slug).single()

  if (!product) return { title: 'Product Not Found' }

  return {
    title: product.title,
    description: product.description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.title,
      description: product.description || undefined,
      images: product.image_urls?.[0] ? [{ url: product.image_urls[0] }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description: product.description || undefined,
      images: product.image_urls?.[0] ? [product.image_urls[0]] : [],
    }
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: product } = await supabase
    .from('products')
    .select('*, category:categories(name, slug)')
    .eq('slug', slug)
    .single()
  
  if (!product) {
    notFound()
  }

  const category = product.category as { name: string; slug: string } | null

  const { data: relatedProducts } = await supabase
    .from('products')
    .select('*')
    .eq('category_id', product.category_id)
    .neq('id', product.id)
    .limit(4)

  // Fetch reviews with user profiles
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*, profiles(full_name, avatar_url)')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false })

  // Rating is derived from the reviews actually in the database. The page used
  // to hard-code 4/5 stars and "(24 reviews)" above a review list that could be
  // empty.
  const reviewList = reviews ?? []
  const rating = averageRating(reviewList.map((r) => r.rating as number))
  const stock = stockLevel(product.inventory_count)

  const crumbs = [
    { name: 'Home', path: '/' },
    category
      ? { name: category.name, path: `/categories/${category.slug}` }
      : { name: 'All products', path: '/categories/all' },
    { name: product.title, path: `/product/${product.slug}` },
  ]
  const productData = productJsonLd(product, {
    siteUrl,
    category: category?.name,
    ratings: reviewList.map((r) => r.rating as number),
  })

  return (
    // max-w-6xl: with the photo column capped, the text column would otherwise
    // stretch to the full width of wide screens.
    <div className="mx-auto w-full max-w-6xl px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(productData) }}
      />
      <Breadcrumbs crumbs={crumbs} />
      {/* The photo column is capped at 340-380px (it was half the page, ~700px);
          the full-size view is a click away in the gallery. */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-12 mb-16">
        
        <ProductGallery images={product.image_urls ?? []} title={product.title} />

        <div className="flex flex-col space-y-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">{product.title}</h1>
            <div className="flex items-center space-x-4">
              {rating !== null ? (
                <>
                  <div
                    className="flex items-center text-yellow-500"
                    aria-label={`Rated ${rating} out of 5`}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        aria-hidden="true"
                        className={`w-5 h-5 ${i < Math.round(rating) ? 'fill-current' : 'text-muted'}`}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground">
                    {rating} ({reviewList.length}{' '}
                    {reviewList.length === 1 ? 'review' : 'reviews'})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">No reviews yet</span>
              )}
            </div>
          </div>

          <div className="text-3xl font-bold text-primary">
            {formatPrice(product.price)}
          </div>

          <p className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden="true"
              className={cn(
                'size-2 rounded-full',
                stock === 'out' ? 'bg-destructive' : stock === 'low' ? 'bg-amber-500' : 'bg-green-500',
              )}
            />
            <span className={stock === 'low' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
              {stockLabel(product.inventory_count)}
            </span>
          </p>
          
          <p className="text-lg text-muted-foreground leading-relaxed">
            {product.description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y">
            <div className="flex items-center space-x-3 text-sm">
              <Shield className="w-5 h-5 text-green-500" />
              <span>1 Year Warranty</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <Truck className="w-5 h-5 text-blue-500" />
              <span>Free Shipping</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <RotateCcw className="w-5 h-5 text-orange-500" />
              <span>30-Day Returns</span>
            </div>
          </div>

          <div className="pt-4">
            <AddToCartButton product={product} disabled={product.inventory_count <= 0} />
          </div>
        </div>
      </div>

      <div className="mb-16 max-w-2xl">
        <div>
          <h2 className="text-2xl font-bold mb-4">Specifications</h2>
          <Card>
            <CardContent className="p-6">
              <dl className="space-y-4">
                {product.attributes && Object.entries(product.attributes).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <dt className="font-medium text-muted-foreground capitalize">{key}</dt>
                    <dd className="col-span-2 font-medium">{String(value)}</dd>
                  </div>
                ))}
                {!product.attributes && <p className="text-muted-foreground">No specifications provided.</p>}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Real Review Section */}
      <ReviewSection productId={product.id} initialReviews={reviewList} />

      {/* Related Products Section */}
      {relatedProducts && relatedProducts.length > 0 && (
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Related Products</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {(relatedProducts || []).map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
