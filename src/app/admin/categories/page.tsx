import Link from 'next/link'
import Image from 'next/image'
import { Pencil, Plus } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'
import { deleteCategory } from '@/app/actions/admin'

export default async function AdminCategoriesPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('id, name, slug, description, image_url').order('name'),
    supabase.from('products').select('category_id'),
  ])

  const counts = new Map<string, number>()
  for (const p of products ?? []) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-2">
            Shown in the header, the footer and on the homepage tiles.
          </p>
        </div>
        <Link href="/admin/categories/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          Add category
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium">Address</th>
                  <th className="px-6 py-4 font-medium text-right">Products</th>
                  <th className="px-6 py-4 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categories?.map((category) => {
                  const count = counts.get(category.id) ?? 0
                  return (
                    <tr key={category.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-10 relative bg-muted rounded overflow-hidden flex-shrink-0">
                            {category.image_url && (
                              <Image src={category.image_url} alt="" fill sizes="64px" className="object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/categories/${category.id}/edit`}
                              className="font-medium line-clamp-1 hover:underline"
                            >
                              {category.name}
                            </Link>
                            <div className="text-muted-foreground text-xs line-clamp-1">{category.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link href={`/categories/${category.slug}`} className="font-mono text-xs hover:underline">
                          /categories/{category.slug}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums">{count}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/categories/${category.id}/edit`}
                          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                          aria-label={`Edit ${category.name}`}
                        >
                          <Pencil />
                        </Link>
                        <ConfirmDeleteButton
                          action={deleteCategory.bind(null, category.id)}
                          name={category.name}
                          question="Delete this category?"
                          consequence={
                            count > 0
                              ? `its ${count} ${count === 1 ? 'product stays' : 'products stay'} in the store, uncategorised.`
                              : 'it has no products.'
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
                {!categories?.length && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                      No categories yet.
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
