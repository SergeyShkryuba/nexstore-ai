import { Link } from '@/i18n/navigation'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CategoryForm } from '@/components/admin/CategoryForm'
import { createClient } from '@/utils/supabase/server'

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('id, name, description, image_url, translations:category_translations(locale, name, description)')
    .eq('id', id)
    .maybeSingle()

  if (!category) notFound()

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/categories"
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          aria-label="Back to categories"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Edit category</h1>
          <p className="text-muted-foreground mt-2 truncate">{category.name}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <CategoryForm category={category} />
        </CardContent>
      </Card>
    </div>
  )
}
