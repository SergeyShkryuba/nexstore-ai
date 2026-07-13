'use client'

import { ShoppingCart } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useCartStore } from '@/store/useCartStore'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function CartButton() {
  const totalItems = useCartStore((state) => state.totalItems())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  return (
    <Link href="/cart" className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })}>
      <ShoppingCart className="h-5 w-5" />
      {mounted && totalItems > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
          {totalItems}
        </span>
      )}
      <span className="sr-only">Cart</span>
    </Link>
  )
}
