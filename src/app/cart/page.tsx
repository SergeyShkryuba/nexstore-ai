'use client'

import { useCartStore } from '@/store/useCartStore'
import { useCartHydrated } from '@/store/useCartHydrated'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import Image from 'next/image'
import { Trash2, Plus, Minus, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'

export default function CartPage() {
  const hydrated = useCartHydrated()
  const [isLoading, setIsLoading] = useState(false)

  const items = useCartStore((state) => state.items)
  const removeItem = useCartStore((state) => state.removeItem)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const totalPrice = useCartStore((state) => state.totalPrice())

  const handleCheckout = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only ids and quantities: the server re-reads prices from the
        // database, so anything else we sent would be ignored anyway.
        body: JSON.stringify({
          items: items.map((item) => ({ id: item.id, quantity: item.quantity })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data?.error ?? 'Checkout failed')
        return
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      toast.error('Checkout failed', { description: 'No payment URL was returned.' })
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('An error occurred during checkout')
    } finally {
      setIsLoading(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <h1 className="text-3xl font-bold mb-8">Your Cart</h1>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Your Cart</h1>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Your cart is empty</p>
          <Link href="/categories/all" className={buttonVariants()}>
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <ul className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardContent className="p-4 flex items-center gap-4">
                    {item.image_url ? (
                      <div className="w-20 h-20 relative flex-shrink-0">
                        <Image
                          src={item.image_url}
                          alt={item.title}
                          fill
                          sizes="80px"
                          className="object-cover rounded-md"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded-md flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <h2 className="font-semibold">{item.title}</h2>
                      <p className="text-primary font-bold">{formatPrice(item.price)}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Decrease quantity of ${item.title}`}
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <span className="w-8 text-center" aria-live="polite">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Increase quantity of ${item.title}`}
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.title} from cart`}
                      onClick={() => removeItem(item.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <div>
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-4">Order Summary</h2>
                <dl className="space-y-3 mb-4 text-sm">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between text-muted-foreground">
                      <dt>
                        {item.quantity}× {item.title}
                      </dt>
                      <dd>{formatPrice(item.price * item.quantity)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex justify-between font-bold text-lg border-t border-border/50 pt-4 mb-6">
                  <span>Total</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>

                <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Proceed to Checkout
                </Button>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Prices are re-verified on the server before payment.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
