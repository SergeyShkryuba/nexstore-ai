'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduct, updateProduct } from '@/app/actions/admin'
import { ImageManager } from './ImageManager'
import { SizesEditor, type SizeRow } from './SizesEditor'
import { sortVariants } from '@/lib/variants'

export type EditableProduct = {
  id: string
  title: string
  description: string | null
  price: number
  inventory_count: number
  category_id: string | null
  image_urls: string[] | null
  variants?: { size: string; inventory_count: number; sort_order?: number | null }[] | null
}

const fieldClassName =
  'flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/** Create when `product` is absent, edit when it is given. */
export function ProductForm({
  categories,
  product,
}: {
  categories: { id: string; name: string }[]
  product?: EditableProduct
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sizes, setSizes] = useState<SizeRow[]>(() =>
    sortVariants(product?.variants).map(({ size, inventory_count }) => ({ size, inventory_count })),
  )
  const sizedTotal = sizes.reduce((sum, row) => sum + row.inventory_count, 0)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = product ? await updateProduct(product.id, formData) : await createProduct(formData)

    if ('error' in result) {
      toast.error(result.error)
      setIsSubmitting(false)
      return
    }

    toast.success(product ? 'Product saved' : 'Product created')
    router.push('/admin/products')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={product?.title}
          placeholder="e.g. Wireless Headphones"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ''}
          className={`${fieldClassName} min-h-[120px]`}
          placeholder="What it is, who it is for, what makes it good…"
        />
        <p className="text-xs text-muted-foreground">
          Semantic search reads this, so describe what the product is for, not only what it is.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label htmlFor="price">
            Price (€) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.price}
            placeholder="99.99"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inventory_count">Stock</Label>
          {sizes.length > 0 ? (
            // With sizes the total is their sum; the per-size stock is below.
            <p id="inventory_count" className="flex h-8 items-center text-sm tabular-nums">
              {sizedTotal} <span className="ml-1 text-muted-foreground">across sizes</span>
            </p>
          ) : (
            <Input
              id="inventory_count"
              name="inventory_count"
              type="number"
              step="1"
              min="0"
              defaultValue={product?.inventory_count ?? 0}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Available to sell. Units in open checkouts are already taken out.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category_id">
            Category <span className="text-destructive">*</span>
          </Label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue={product?.category_id ?? ''}
            className={`${fieldClassName} h-9`}
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Sizes</legend>
        <SizesEditor rows={sizes} onChange={setSizes} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Images</legend>
        <ImageManager initial={product?.image_urls ?? []} />
      </fieldset>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" /> Saving…
          </>
        ) : product ? (
          'Save changes'
        ) : (
          'Create product'
        )}
      </Button>
    </form>
  )
}
