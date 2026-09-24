'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { ImageOff, Ruler, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { WishlistButton } from './WishlistButton'
import { formatPrice } from '@/lib/format'
import { stockLabel, stockLevel } from '@/lib/stock'
import { sortVariants } from '@/lib/variants'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  product: {
    id: string
    title: string
    slug: string
    price: number
    image_urls: string[] | null
    /** Optional: callers that do not select stock get no sold-out state. */
    inventory_count?: number | null
    /** Sizes, for products sold in them. Every list that shows cards selects these. */
    variants?: { size: string; inventory_count: number; sort_order?: number | null }[] | null
  }
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem)
  const imageUrl = product.image_urls?.[0]
  const stock = stockLevel(product.inventory_count)
  const soldOut = stock === 'out'
  const sizes = sortVariants(product.variants)
  const sizesInStock = sizes.filter((v) => v.inventory_count > 0).map((v) => v.size)
  const productUrl = `/product/${product.slug}`

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
    // py-0/gap-0: the card's default padding left an empty strip above the
    // photo. Translucent with a blur, like the header, so section photos show.
    <Card className="relative overflow-hidden flex flex-col h-full gap-0 py-0 group bg-background/50 backdrop-blur-lg dark:bg-background/35">
      <Link href={productUrl} className="block flex-1">
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
          {(stock === 'out' || stock === 'low') && (
            <span
              className={cn(
                'absolute bottom-2 left-2 rounded-md px-2 py-1 text-xs font-medium',
                stock === 'out' ? 'bg-background/90' : 'bg-amber-500 text-black',
              )}
            >
              {stock === 'out' ? 'Sold out' : stockLabel(product.inventory_count)}
            </span>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg line-clamp-1">{product.title}</h3>
          <p className="text-primary font-bold mt-2">{formatPrice(product.price)}</p>
          {sizesInStock.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="sr-only">Sizes in stock: </span>
              {sizesInStock.join(' · ')}
            </p>
          )}
        </CardContent>
      </Link>

      {/* Outside the Link: a button nested in an anchor is invalid markup and
          breaks keyboard navigation. */}
      <div className="absolute top-2 right-2 z-10">
        <WishlistButton productId={product.id} />
      </div>

      {/* Even padding on all sides: pt-0 under the footer's border pressed the
          button against the line while 16px sat below it. */}
      <CardFooter className="mt-auto border-border/50 bg-transparent p-4">
        {sizes.length > 0 && !soldOut ? (
          // A sized product cannot go into the cart without a size.
          <Link href={productUrl} className={buttonVariants({ className: 'w-full' })}>
            <Ruler className="w-4 h-4 mr-2" aria-hidden="true" />
            Choose size
          </Link>
        ) : (
          <Button className="w-full" onClick={handleAdd} disabled={soldOut}>
            <ShoppingCart className="w-4 h-4 mr-2" aria-hidden="true" />
            {soldOut ? 'Sold out' : 'Add to Cart'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
