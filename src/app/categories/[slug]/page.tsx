import { Suspense } from 'react'
import { CatalogView, ProductGrid, type CatalogItem } from '@/components/catalog/CatalogView'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { createPublicClient } from '@/utils/supabase/public'

import type { Metadata } from 'next'

export const revalidate = 300

export async function generateStaticParams() {
  const supabase = createPublicClient()
  const { data } = await supabase.from('categories').select('slug')
  return [{ slug: 'all' }, ...(data ?? []).map((c) => ({ slug: c.slug as string }))]
}

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  // Filtered views (?sort=…&max=…) are the same page to a search engine.
  if (slug === 'all') return { title: 'All Products', alternates: { canonical: '/categories/all' } }

  const supabase = createPublicClient()
  const { data: category } = await supabase.from('categories').select('*').eq('slug', slug).single()

  if (!category) return { title: 'Category Not Found' }

  return {
    title: category.name,
    description: category.description,
    alternates: { canonical: `/categories/${category.slug}` },
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
  const { slug } = await params
  const supabase = createPublicClient()
  
  const isAll = slug === 'all'
  let category = null

  if (!isAll) {
    const { data } = await supabase.from('categories').select('*').eq('slug', slug).single()
    category = data
    if (!category) {
      notFound()
    }
  }

  const query = supabase
    .from('products')
    .select('id, title, slug, price, image_urls, inventory_count, created_at, attributes, variants:product_variants(size, inventory_count, sort_order)')
  if (!isAll && category) {
    query.eq('category_id', category.id)
  }

  const { data } = await query
  const products: CatalogItem[] = data || []

  return (
    <div className="container mx-auto px-4 py-8 *:mx-auto *:max-w-7xl">
      <Breadcrumbs
        crumbs={[
          { name: 'Home', path: '/' },
          isAll || !category
            ? { name: 'All products', path: '/categories/all' }
            : { name: category.name, path: `/categories/${category.slug}` },
        ]}
      />
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{isAll ? 'All Products' : category?.name}</h1>
        {category?.description && (
          <p className="text-muted-foreground mt-2">{category.description}</p>
        )}
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground">No products found in this category.</p>
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
