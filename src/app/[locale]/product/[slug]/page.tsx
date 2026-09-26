import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ProductPurchase } from '@/components/product/ProductPurchase'
import { sortVariants, type Variant } from '@/lib/variants'
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
import { isLocale, localizedPath, type Locale } from '@/i18n/routing'
import { CATEGORY_TRANSLATIONS, PRODUCT_TRANSLATIONS, localizeCategory, localizeProduct, localizeProducts } from '@/lib/localized'
import { alternates } from '@/lib/seo'

import type { Metadata } from 'next'

export const revalidate = 300

export async function generateStaticParams() {
  const supabase = createPublicClient()
  const { data } = await supabase.from('products').select('slug')
  return (data ?? []).map((p) => ({ slug: p.slug as string }))
}

interface ProductPageProps {
  params: Promise<{
    locale: string
    slug: string
  }>
}

type ProductRow = {
  id: string
  slug: string
  title: string
  description: string | null
  price: number
  inventory_count: number
  image_urls: string[] | null
  attributes: Record<string, unknown> | null
  category_id: string | null
  variants: Variant[] | null
  category: { name: string; slug: string; translations?: { locale: string; name: string | null; description: string | null }[] | null } | null
  translations?: { locale: string; title: string | null; description: string | null; attributes: Record<string, unknown> | null }[] | null
}

async function loadProduct(slug: string, locale: Locale) {
  const { data } = await createPublicClient()
    .from('products')
    .select(
      `*, category:categories(name, slug, ${CATEGORY_TRANSLATIONS}), variants:product_variants(id, size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`,
    )
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return null
  // The select is built from a template string, which the client cannot type.
  const row = data as unknown as ProductRow
  const product = localizeProduct(row, locale)
  const category = row.category ? localizeCategory(row.category, locale) : null
  return { ...product, category }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const product = await loadProduct(slug, locale)

  if (!product) {
    const t = await getTranslations({ locale, namespace: 'Product' })
    return { title: t('notFound') }
  }

  return {
    title: product.title,
    description: product.description,
    alternates: alternates(`/product/${product.slug}`, locale),
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
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const supabase = createPublicClient()
  const [product, t, tStock] = await Promise.all([
    loadProduct(slug, locale),
    getTranslations('Product'),
    getTranslations('Stock'),
  ])

  if (!product) {
    notFound()
  }

  const category = product.category
  const variants = sortVariants(product.variants as Variant[] | null)

  const { data: relatedRows } = await supabase
    .from('products')
    .select(`*, variants:product_variants(size, inventory_count), ${PRODUCT_TRANSLATIONS}`)
    .eq('category_id', product.category_id)
    .neq('id', product.id)
    .limit(4)
  const relatedProducts = localizeProducts(relatedRows, locale) as Parameters<typeof ProductCard>[0]['product'][]

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
    { name: t('home'), path: '/' },
    category
      ? { name: category.name, path: `/categories/${category.slug}` }
      : { name: t('allProducts'), path: '/categories/all' },
    { name: product.title, path: `/product/${product.slug}` },
  ]
  const productData = productJsonLd(product, {
    siteUrl,
    category: category?.name,
    ratings: reviewList.map((r) => r.rating as number),
    path: localizedPath(`/product/${product.slug}`, locale),
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
                    aria-label={t('ratedOutOf5', { rating })}
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
                    {rating} ({t('reviewCount', { count: reviewList.length })})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">{t('noReviews')}</span>
              )}
            </div>
          </div>

          <div className="text-3xl font-bold text-primary">
            {formatPrice(product.price, locale)}
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
              {stockLabel(product.inventory_count, (k, v) => tStock(k, v))}
            </span>
          </p>

          <p className="text-lg text-muted-foreground leading-relaxed">
            {product.description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y">
            <div className="flex items-center space-x-3 text-sm">
              <Shield className="w-5 h-5 text-green-500" aria-hidden="true" />
              <span>{t('warranty')}</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <Truck className="w-5 h-5 text-blue-500" aria-hidden="true" />
              <span>{t('freeShipping')}</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <RotateCcw className="w-5 h-5 text-orange-500" aria-hidden="true" />
              <span>{t('returns')}</span>
            </div>
          </div>

          <div className="pt-4">
            <ProductPurchase product={product} variants={variants} />
          </div>
        </div>
      </div>

      <div className="mb-16 max-w-2xl">
        <div>
          <h2 className="text-2xl font-bold mb-4">{t('specifications')}</h2>
          <Card>
            <CardContent className="p-6">
              <dl className="space-y-4">
                {product.attributes && Object.entries(product.attributes).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <dt className="font-medium text-muted-foreground capitalize">{key.replaceAll('_', ' ')}</dt>
                    <dd className="col-span-2 font-medium">{String(value)}</dd>
                  </div>
                ))}
                {!product.attributes && <p className="text-muted-foreground">{t('noSpecifications')}</p>}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Real Review Section */}
      <ReviewSection productId={product.id} initialReviews={reviewList} />

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">{t('related')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {relatedProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
