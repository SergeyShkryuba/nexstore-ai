'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { ImageOff, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { WishlistButton } from './WishlistButton'
import { formatPrice } from '@/lib/format'

interface ProductCardProps {
  product: {
    id: string
    title: string
    slug: string
    price: number
    image_urls: string[] | null
  }
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem)
  const imageUrl = product.image_urls?.[0]

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    addItem({
      id: product.id,
      title: product.title,
      price: product.price,
      quantity: 1,
      image_url: imageUrl,
    })
    toast.success('Added to cart', { description: product.title })
  }

  return (
    <Card className="relative overflow-hidden flex flex-col h-full group">
      <Link href={`/product/${product.slug}`} className="block flex-1">
        <div className="aspect-square bg-muted relative overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <ImageOff className="h-8 w-8" aria-hidden="true" />
              <span className="sr-only">No image available</span>
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg line-clamp-1">{product.title}</h3>
          <p className="text-primary font-bold mt-2">{formatPrice(product.price)}</p>
        </CardContent>
      </Link>

      {/* Outside the Link: a button nested in an anchor is invalid markup and
          breaks keyboard navigation. */}
      <div className="absolute top-2 right-2 z-10">
        <WishlistButton productId={product.id} />
      </div>

      <CardFooter className="p-4 pt-0 mt-auto">
        <Button className="w-full" onClick={handleAdd}>
          <ShoppingCart className="w-4 h-4 mr-2" aria-hidden="true" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  )
}
