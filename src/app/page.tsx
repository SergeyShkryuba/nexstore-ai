import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchSection } from '@/components/home/SearchSection'
import { ProductCard } from '@/components/product/ProductCard'
import { createPublicClient } from '@/utils/supabase/public'

export const revalidate = 300

export default async function Home() {
  const supabase = createPublicClient()

  // Categories used to be hard-coded in JSX, so adding one in the admin panel
  // never showed up on the homepage.
  const [{ data: categories }, { data: featured }] = await Promise.all([
    supabase.from('categories').select('id, name, slug, description').order('name'),
    supabase
      .from('products')
      .select('id, title, slug, price, image_urls')
      .order('created_at', { ascending: false })
      .limit(4),
  ])

  return (
    <div className="container mx-auto px-4 py-12">
      <SearchSection />

      {featured && featured.length > 0 && (
        <section className="py-16 mt-12 border-t">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-bold">New arrivals</h2>
            <Link
              href="/categories/all"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {categories && categories.length > 0 && (
        <section className="py-16 border-t">
          <h2 className="text-3xl font-bold mb-8 text-center">Browse by category</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((category) => (
              <Card key={category.id} className="hover:border-primary transition-colors">
                <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                  <h3 className="text-xl font-semibold">{category.name}</h3>
                  <p className="text-sm text-muted-foreground flex-1">{category.description}</p>
                  <Link
                    href={`/categories/${category.slug}`}
                    className={buttonVariants({ variant: 'secondary', className: 'w-full' })}
                  >
                    Browse {category.name}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
