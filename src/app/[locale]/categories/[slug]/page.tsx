import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CatalogView, ProductGrid, type CatalogItem } from '@/components/catalog/CatalogView'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { createPublicClient } from '@/utils/supabase/public'
import { isLocale, type Locale } from '@/i18n/routing'
import { CATEGORY_TRANSLATIONS, PRODUCT_TRANSLATIONS, localizeCategory, localizeProducts } from '@/lib/localized'
import { alternates } from '@/lib/seo'

import type { Metadata } from 'next'

export const revalidate = 300

export async function generateStaticParams() {
  const supabase = createPublicClient()
  const { data } = await supabase.from('categories').select('slug')
  return [{ slug: 'all' }, ...(data ?? []).map((c) => ({ slug: c.slug as string }))]
}

interface CategoryPageProps {
  params: Promise<{
    locale: string
    slug: string
  }>
}

async function loadCategory(slug: string, locale: Locale) {
  const { data } = await createPublicClient()
    .from('categories')
    .select(`*, ${CATEGORY_TRANSLATIONS}`)
    .eq('slug', slug)
    .maybeSingle()
  return data ? localizeCategory(data, locale) : null
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'Category' })
  // Filtered views (?sort=…&max=…) are the same page to a search engine.
  if (slug === 'all') return { title: t('allProducts'), alternates: alternates('/categories/all', locale) }

  const category = await loadCategory(slug, locale)
  if (!category) return { title: t('notFound') }

  return {
    title: category.name,
    description: category.description,
    alternates: alternates(`/categories/${category.slug}`, locale),
    openGraph: {
      title: category.name,
      description: category.description || undefined,
      images: category.image_url ? [{ url: category.image_url }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: category.name,
      description: category.description || undefined,
      images: category.image_url ? [category.image_url] : [],
    }
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const supabase = createPublicClient()
  const t = await getTranslations('Category')

  const isAll = slug === 'all'
  let category = null

  if (!isAll) {
    category = await loadCategory(slug, locale)
    if (!category) {
      notFound()
    }
  }

  const query = supabase
    .from('products')
    .select(`id, title, slug, price, image_urls, inventory_count, created_at, attributes, variants:product_variants(size, inventory_count, sort_order), ${PRODUCT_TRANSLATIONS}`)
  if (!isAll && category) {
    query.eq('category_id', category.id)
  }

  const { data } = await query
  const products: CatalogItem[] = localizeProducts(data, locale)

  return (
    <div className="container mx-auto px-4 py-8 *:mx-auto *:max-w-7xl">
      <Breadcrumbs
        crumbs={[
          { name: t('home'), path: '/' },
          isAll || !category
            ? { name: t('allProducts'), path: '/categories/all' }
            : { name: category.name, path: `/categories/${category.slug}` },
        ]}
      />
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{isAll ? t('allProducts') : category?.name}</h1>
        {category?.description && (
          <p className="text-muted-foreground mt-2">{category.description}</p>
        )}
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        // The fallback is the full, unfiltered grid: it is what gets prerendered,
        // and the filter bar takes over once the URL can be read in the browser.
        <Suspense fallback={<ProductGrid products={products} />}>
          <CatalogView products={products} />
        </Suspense>
      )}
    </div>
  )
}
