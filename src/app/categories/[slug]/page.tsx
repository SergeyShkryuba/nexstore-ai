import { ProductCard } from '@/components/product/ProductCard'
import { notFound } from 'next/navigation'
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
  const supabase = createPublicClient()
  const { data: category } = await supabase.from('categories').select('*').eq('slug', slug).single()

  if (!category) return { title: 'Category Not Found' }

  return {
    title: category.name,
    description: category.description,
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

  const query = supabase.from('products').select('*')
  if (!isAll && category) {
    query.eq('category_id', category.id)
  }

  const { data } = await query
  const products = data || []

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{isAll ? 'All Products' : category?.name}</h1>
        {category?.description && (
          <p className="text-muted-foreground mt-2">{category.description}</p>
        )}
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground">No products found in this category.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
