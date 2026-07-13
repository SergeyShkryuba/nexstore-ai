'use client'

import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { toggleWishlist } from '@/app/actions/wishlist'
import { usePathname } from 'next/navigation'

export function WishlistButton({ productId }: { productId: string }) {
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    let mounted = true
    const checkWishlist = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (mounted) setIsLoading(false)
        return
      }

      const { data } = await supabase
        .from('wishlist')
        .select('id')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .single()
      
      if (mounted) {
        setIsWishlisted(!!data)
        setIsLoading(false)
      }
    }
    checkWishlist()

    return () => { mounted = false }
  }, [productId, supabase.auth])

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Please sign in to add items to your wishlist.')
      return
    }

    // Optimistic update
    setIsWishlisted(!isWishlisted)
    
    try {
      const res = await toggleWishlist(productId, pathname)
      if (res.error) {
        setIsWishlisted(isWishlisted) // revert
        toast.error(res.error)
      } else {
        toast.success(isWishlisted ? 'Removed from wishlist' : 'Added to wishlist')
      }
    } catch (err) {
      setIsWishlisted(isWishlisted) // revert
      toast.error('Failed to update wishlist')
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full bg-background/80 opacity-50" disabled>
        <Heart className="w-4 h-4 text-muted-foreground" />
      </Button>
    )
  }

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleToggle}
      className={`w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90 transition-colors ${
        isWishlisted ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
    </Button>
  )
}
