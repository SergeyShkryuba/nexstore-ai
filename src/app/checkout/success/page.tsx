'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [mounted, setMounted] = useState(false)
  const clearCart = useCartStore(state => state.clearCart)

  useEffect(() => {
    setMounted(true)
    if (sessionId) {
      clearCart()
    }
  }, [sessionId, clearCart])

  if (!mounted) return null

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
      <CheckCircle2 className="h-24 w-24 text-green-500 mb-6" />
      <h1 className="text-4xl font-bold mb-4">Payment Successful!</h1>
      <p className="text-xl text-muted-foreground mb-2">
        Thank you for your purchase. Your order has been placed.
      </p>
      {sessionId && (
        <p className="text-sm text-muted-foreground mb-8">
          Session ID: {sessionId.slice(0, 10)}...
        </p>
      )}
      <div className="flex gap-4">
        <Link href="/profile" className={buttonVariants({ variant: "outline", size: "lg" })}>
          View Order History
        </Link>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Continue Shopping
        </Link>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-16 text-center">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  )
}
