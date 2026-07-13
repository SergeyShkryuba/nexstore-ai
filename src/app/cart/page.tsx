'use client'

import { useCartStore } from '@/store/useCartStore'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import Image from 'next/image'
import { Trash2, Plus, Minus, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function CartPage() {
  const [mounted, setMounted] = useState(false)
  const [isCheckout, setIsCheckout] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const items = useCartStore(state => state.items)
  const removeItem = useCartStore(state => state.removeItem)
  const updateQuantity = useCartStore(state => state.updateQuantity)
  const totalPrice = useCartStore(state => state.totalPrice())
  const clearCart = useCartStore(state => state.clearCart)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Mocking an API call to create an order
    setTimeout(() => {
      setIsSuccess(true)
      clearCart()
    }, 1500)
  }

  if (!mounted) {
    return <div className="container mx-auto px-4 py-8">Loading cart...</div>
  }

  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
        <CheckCircle2 className="h-24 w-24 text-green-500 mb-6" />
        <h1 className="text-4xl font-bold mb-4">Order Placed Successfully!</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Thank you for your purchase. We have received your order and will process it shortly.
        </p>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Return to Home
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">{isCheckout ? 'Checkout' : 'Your Cart'}</h1>
      
      {items.length === 0 && !isCheckout ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Your cart is empty</p>
          <Link href="/categories/all" className={buttonVariants()}>
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            
            {isCheckout ? (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-bold mb-6">Shipping Information</h2>
                  <form id="checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">First Name</label>
                        <Input required placeholder="John" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Last Name</label>
                        <Input required placeholder="Doe" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email</label>
                      <Input required type="email" placeholder="john@example.com" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Address</label>
                      <Input required placeholder="123 Main St" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">City</label>
                        <Input required placeholder="New York" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">ZIP Code</label>
                        <Input required placeholder="10001" />
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              items.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    {item.image_url ? (
                      <div className="w-20 h-20 relative flex-shrink-0">
                        <Image 
                          src={item.image_url} 
                          alt={item.title} 
                          fill
                          className="object-cover rounded-md" 
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded-md flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-primary font-bold">${item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-destructive">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          
          <div>
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold mb-4">Order Summary</h3>
                <div className="space-y-3 mb-4 text-sm">
                  {items.map(item => (
                    <div key={item.id} className="flex justify-between text-muted-foreground">
                      <span>{item.quantity}x {item.title}</span>
                      <span>${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-bold text-lg border-t border-border/50 pt-4 mb-6">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
                
                {isCheckout ? (
                  <Button type="submit" form="checkout-form" className="w-full" size="lg">
                    Place Order
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" onClick={() => setIsCheckout(true)}>
                    Proceed to Checkout
                  </Button>
                )}
                
                {isCheckout && (
                  <Button variant="ghost" className="w-full mt-2" onClick={() => setIsCheckout(false)}>
                    Back to Cart
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
