import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { SearchSection } from '@/components/home/SearchSection'
import { ProductCard } from '@/components/product/ProductCard'
import { PhotoSection } from '@/components/home/PhotoSection'
import { createPublicClient } from '@/utils/supabase/public'

export const revalidate = 300

/** The "budget picks" shelf; its link opens the catalogue with the same filter. */
const BUDGET = 50

const CARD_FIELDS = 'id, title, slug, price, image_urls, inventory_count, variants:product_variants(size, inventory_count, sort_order)'

/** Dark, edge-weighted photos: the props sit at the borders, the cards in the middle. */
const SHELF_IMAGES = {
  arrivals: 'https://images.unsplash.com/photo-1437419764061-2473afe69fc2?w=2000&q=70',
  budget: 'https://images.unsplash.com/photo-1587424279915-db56f37265f3?w=2000&q=70',
}

export default async function Home() {
  const supabase = createPublicClient()

  // Categories used to be hard-coded in JSX, so adding one in the admin panel
  // never showed up on the homepage.
  const [{ data: categories }, { data: featured }, { data: budgetPicks }] = await Promise.all([
    supabase.from('categories').select('id, name, slug, description, image_url').order('name'),
    supabase.from('products').select(CARD_FIELDS).order('created_at', { ascending: false }).limit(4),
    supabase
      .from('products')
      .select(CARD_FIELDS)
      .lte('price', BUDGET)
      .gt('inventory_count', 0)
      .order('price')
      .limit(4),
  ])

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <SearchSection />

      {categories && categories.length > 0 && (
        <>
        <SectionDivider />
        <section className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold mb-8">Shop by category</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative isolate flex aspect-[4/3] items-end overflow-hidden rounded-2xl border bg-muted p-6 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {category.image_url && (
                  <Image
                    src={category.image_url}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="-z-20 object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                {/* Scrim: the label stays readable whatever the photo does. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 bg-linear-to-t from-black/80 via-black/30 to-transparent"
                />
                <div className="text-white">
                  <h3 className="text-2xl font-semibold">{category.name}</h3>
                  <p className="mt-1 text-sm text-white/80">{category.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
                    Shop now
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        </>
      )}

      {featured && featured.length > 0 && (
        <>
          <SectionDivider />
          <ProductShelf
            title="New arrivals"
            href="/categories/all"
            linkLabel="View all"
            id="new-arrivals"
            image={SHELF_IMAGES.arrivals}
            products={featured}
          />
        </>
      )}

      {budgetPicks && budgetPicks.length > 0 && (
        <>
          <SectionDivider />
          <ProductShelf
            title={`Under €${BUDGET}`}
            href={`/categories/all?sort=price-asc&max=${BUDGET}&stock=1`}
            linkLabel={`All under €${BUDGET}`}
            id={`under-${BUDGET}`}
            image={SHELF_IMAGES.budget}
            products={budgetPicks}
          />
        </>
      )}
    </div>
  )
}

/** A barely-there rule between homepage sections. */
function SectionDivider() {
  return <hr className="my-12 border-foreground/10 md:my-16" />
}

function ProductShelf({
  title,
  href,
  linkLabel,
  id,
  image,
  products,
}: {
  title: string
  href: string
  linkLabel: string
  /** Anchor, so the shelf can be linked to directly. */
  id: string
  image: string
  products: Parameters<typeof ProductCard>[0]['product'][]
}) {
  return (
    <PhotoSection id={id} image={image} aria-label={title} className="scroll-mt-20">
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="text-3xl font-bold">{title}</h2>
        <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
          {linkLabel} →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </PhotoSection>
  )
}
