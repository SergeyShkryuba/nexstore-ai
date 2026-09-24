import Link from 'next/link'
import Image from 'next/image'
import { Pencil, Plus } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { DeleteProductButton } from '@/components/admin/DeleteProductButton'
import { formatPrice } from '@/lib/format'
import { stockLabel, stockLevel } from '@/lib/stock'
import { cn } from '@/lib/utils'

export default async function AdminProductsPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('id, title, slug, description, price, inventory_count, image_urls, category:categories(name)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-2">
            {products?.length ?? 0} products. Edit details, photos and stock.
          </p>
        </div>
        <Link href="/admin/products/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          Add product
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium">Product</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium text-right">Price</th>
                  <th className="px-6 py-4 font-medium">Stock</th>
                  <th className="px-6 py-4 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products?.map((product) => {
                  const category = product.category as { name?: string } | null
                  const stock = stockLevel(product.inventory_count)
                  return (
                    <tr key={product.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 relative bg-muted rounded overflow-hidden flex-shrink-0">
                            {product.image_urls?.[0] && (
                              <Image
                                src={product.image_urls[0]}
                                alt=""
                                fill
                                sizes="40px"
                                className="object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/products/${product.id}/edit`}
                              className="font-medium text-foreground line-clamp-1 hover:underline"
                            >
                              {product.title}
                            </Link>
                            <div className="text-muted-foreground text-xs line-clamp-1">
                              {product.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{category?.name ?? 'Uncategorized'}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-right tabular-nums">
                        {formatPrice(product.price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={cn(
                            'tabular-nums',
                            stock === 'out' && 'text-destructive',
                            stock === 'low' && 'text-amber-600 dark:text-amber-400',
                          )}
                        >
                          {product.inventory_count}
                        </span>
                        {stock !== 'in' && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {stockLabel(product.inventory_count)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                          aria-label={`Edit ${product.title}`}
                        >
                          <Pencil />
                        </Link>
                        <DeleteProductButton productId={product.id} title={product.title} />
                      </td>
                    </tr>
                  )
                })}
                {!products?.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No products yet. Add one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
