import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProductForm } from '@/components/admin/ProductForm'
import { createClient } from '@/utils/supabase/server'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('id, title, slug, description, price, inventory_count, category_id, image_urls, variants:product_variants(size, inventory_count, sort_order)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('categories').select('id, name').order('name'),
  ])

  if (!product) notFound()

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/products"
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          aria-label="Back to products"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight truncate">Edit product</h1>
          <p className="text-muted-foreground mt-2 truncate">{product.title}</p>
        </div>
        <Link
          href={`/product/${product.slug}`}
          target="_blank"
          className={buttonVariants({ variant: 'outline' })}
        >
          View in store <ExternalLink aria-hidden="true" />
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          <ProductForm categories={categories ?? []} product={product} />
        </CardContent>
      </Card>
    </div>
  )
}
