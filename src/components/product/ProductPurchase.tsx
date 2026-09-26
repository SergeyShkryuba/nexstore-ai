'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { stockLabel, stockLevel } from '@/lib/stock'
import { cn } from '@/lib/utils'
import type { Variant } from '@/lib/variants'

type Props = {
  product: { id: string; title: string; price: number; image_urls?: string[] | null; inventory_count: number }
  /** Sorted sizes; empty for a product sold without one. */
  variants: Variant[]
}

/**
 * Size picker and Add to Cart. For a product sold in sizes nothing goes into
 * the cart until a size is chosen — checkout would refuse the line anyway.
 */
export function ProductPurchase({ product, variants }: Props) {
  const t = useTranslations('ProductPurchase')
  const tStock = useTranslations('Stock')
  const addItem = useCartStore((state) => state.addItem)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const hasSizes = variants.length > 0
  const selected = variants.find((v) => v.id === selectedId) ?? null
  const soldOut = hasSizes ? variants.every((v) => v.inventory_count <= 0) : product.inventory_count <= 0
  const canAdd = !soldOut && (!hasSizes || (selected !== null && selected.inventory_count > 0))

  const handleAdd = () => {
    if (!canAdd) return
    addItem({
      id: product.id,
      title: product.title,
      price: product.price,
      image_url: product.image_urls?.[0],
      quantity: 1,
      ...(selected ? { variantId: selected.id, size: selected.size } : {}),
    })
    toast.success(t('added'), {
      description: selected ? t('addedWithSize', { title: product.title, size: selected.size }) : product.title,
    })
  }

  return (
    <div className="space-y-4">
      {hasSizes && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            {t('size')}{selected && <span className="text-muted-foreground">: {selected.size}</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const out = variant.inventory_count <= 0
              const isSelected = variant.id === selectedId
              return (
                <label
                  key={variant.id}
                  className={cn(
                    'relative flex h-10 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors',
                    'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                    out && 'cursor-not-allowed text-muted-foreground line-through opacity-60 hover:bg-transparent',
                  )}
                >
                  <input
                    type="radio"
                    name="size"
                    value={variant.id}
                    checked={isSelected}
                    disabled={out}
                    onChange={() => setSelectedId(variant.id)}
                    className="sr-only"
                  />
                  {variant.size}
                  {out && <span className="sr-only"> ({t('sizeSoldOut')})</span>}
                </label>
              )
            })}
          </div>
          {selected && stockLevel(selected.inventory_count) === 'low' && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              {t('lowInSize', {
                stock: stockLabel(selected.inventory_count, (k, v) => tStock(k, v)) ?? '',
                size: selected.size,
              })}
            </p>
          )}
        </fieldset>
      )}

      <Button size="lg" className="w-full sm:w-auto" onClick={handleAdd} disabled={!canAdd}>
        <ShoppingCart className="mr-2 h-5 w-5" aria-hidden="true" />
        {soldOut ? t('outOfStock') : hasSizes && !selected ? t('chooseSize') : t('addToCart')}
      </Button>
    </div>
  )
}
