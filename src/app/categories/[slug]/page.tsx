import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '@/shared/lib/mockData'
import { ProductCard } from '@/components/product/ProductCard'
import { notFound } from 'next/navigation'

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  
  const isAll = slug === 'all'
  const category = MOCK_CATEGORIES.find(c => c.slug === slug)
  
  if (!category && !isAll) {
    notFound()
  }

  const products = isAll 
    ? MOCK_PRODUCTS 
    : MOCK_PRODUCTS.filter(p => p.category_id === category?.id)

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
