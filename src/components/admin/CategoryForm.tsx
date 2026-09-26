'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCategory, updateCategory } from '@/app/actions/admin'
import { ImageManager } from './ImageManager'
import { CATEGORY_TRANSLATION_LIMITS } from '@/lib/admin-schemas'
import { TranslationFields, type TranslationRow } from './TranslationFields'

export type EditableCategory = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  translations?: TranslationRow[] | null
}

/** Create when `category` is absent, edit when it is given. */
export function CategoryForm({ category }: { category?: EditableCategory }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = category ? await updateCategory(category.id, formData) : await createCategory(formData)

    if ('error' in result) {
      toast.error(result.error)
      setIsSubmitting(false)
      return
    }

    toast.success(category ? 'Category saved' : 'Category created')
    router.push('/admin/categories')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input id="name" name="name" required defaultValue={category?.name} placeholder="e.g. Outdoor" />
        {category && (
          <p className="text-xs text-muted-foreground">
            Renaming keeps the category&apos;s address, so existing links keep working.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          maxLength={300}
          defaultValue={category?.description ?? ''}
          className="flex min-h-[90px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          placeholder="One line, shown on the category tile and page."
        />
      </div>

      <TranslationFields
        initial={category?.translations}
        nameLabel="Name"
        limits={CATEGORY_TRANSLATION_LIMITS}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Tile photo</legend>
        <ImageManager
          initial={category?.image_url ? [category.image_url] : []}
          name="image_url"
          max={1}
          hint="Shown on the homepage tile. A wide photo works best; JPEG/PNG/WebP/AVIF, up to 5 MB."
        />
      </fieldset>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" /> Saving…
          </>
        ) : category ? (
          'Save changes'
        ) : (
          'Create category'
        )}
      </Button>
    </form>
  )
}
