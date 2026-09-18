import { notFound } from 'next/navigation'
import { AddToCartButton } from '@/components/product/AddToCartButton'
import { ProductCard } from '@/components/product/ProductCard'
import { ReviewSection } from '@/components/product/ReviewSection'
import { Star, Shield, Truck, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import Image from 'next/image'
import { createPublicClient } from '@/utils/supabase/public'
import { averageRating, formatPrice } from '@/lib/format'

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

  const { data: product } = await supabase.from('products').select('*').eq('slug', slug).single()
  
  if (!product) {
    notFound()
  }

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

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        
        <div className="aspect-square bg-muted rounded-2xl overflow-hidden border relative">
          {product.image_urls?.[0] ? (
            <Image
              src={product.image_urls[0]}
              alt={product.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No image available
            </div>
          )}
        </div>

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

          <p className="text-sm text-muted-foreground">
            {product.inventory_count > 0
              ? `${product.inventory_count} in stock`
              : 'Currently out of stock'}
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
