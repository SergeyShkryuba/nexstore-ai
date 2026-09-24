import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CategoryForm } from '@/components/admin/CategoryForm'

export default function NewCategoryPage() {
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add category</h1>
          <p className="text-muted-foreground mt-2">It appears in the header and on the homepage.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <CategoryForm />
        </CardContent>
      </Card>
    </div>
  )
}
