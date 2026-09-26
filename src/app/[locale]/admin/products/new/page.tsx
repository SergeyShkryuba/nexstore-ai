import { Link } from '@/i18n/navigation'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProductForm } from '@/components/admin/ProductForm'
import { createClient } from '@/utils/supabase/server'

export default async function NewProductPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase.from('categories').select('id, name').order('name')

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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add product</h1>
          <p className="text-muted-foreground mt-2">Create a new product listing in your store.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <ProductForm categories={categories ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
