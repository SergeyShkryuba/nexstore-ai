'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { ShoppingCart } from 'lucide-react'

interface ProductCardProps {
  product: {
    id: string
    title: string
    slug: string
    price: number
    image_urls: string[]
  }
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem)

  return (
    <Card className="overflow-hidden flex flex-col h-full group">
      <Link href={`/product/${product.slug}`} className="block flex-1">
        <div className="aspect-square bg-muted relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={product.image_urls[0]} 
            alt={product.title}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg line-clamp-1">{product.title}</h3>
          <p className="text-primary font-bold mt-2">${product.price.toFixed(2)}</p>
        </CardContent>
      </Link>
      <CardFooter className="p-4 pt-0 mt-auto">
        <Button 
          className="w-full" 
          onClick={() => addItem({
            id: product.id,
            title: product.title,
            price: product.price,
            quantity: 1,
            image_url: product.image_urls[0]
          })}
        >
          <ShoppingCart className="w-4 h-4 mr-2" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  )
}
