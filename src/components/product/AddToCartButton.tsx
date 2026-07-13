'use client'

import { Button } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { ShoppingCart } from 'lucide-react'

interface Product {
  id: string
  title: string
  price: number
  image_urls?: string[]
}

export function AddToCartButton({ product }: { product: Product }) {
  const addItem = useCartStore(state => state.addItem)

  return (
    <Button 
      size="lg" 
      className="w-full sm:w-auto"
      onClick={() => addItem({
        id: product.id,
        title: product.title,
        price: product.price,
        image_url: product.image_urls?.[0],
        quantity: 1
      })}
    >
      <ShoppingCart className="mr-2 h-5 w-5" />
      Add to Cart
    </Button>
  )
}
