'use client'

import { Button } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  title: string
  price: number
  image_urls?: string[] | null
}

export function AddToCartButton({
  product,
  disabled = false,
}: {
  product: Product
  disabled?: boolean
}) {
  const addItem = useCartStore(state => state.addItem)

  const handleAdd = () => {
    addItem({
      id: product.id,
      title: product.title,
      price: product.price,
      image_url: product.image_urls?.[0],
      quantity: 1
    })
    toast.success('Added to cart', { description: product.title })
  }

  return (
    <Button size="lg" className="w-full sm:w-auto" onClick={handleAdd} disabled={disabled}>
      <ShoppingCart className="mr-2 h-5 w-5" aria-hidden="true" />
      {disabled ? 'Out of stock' : 'Add to Cart'}
    </Button>
  )
}
