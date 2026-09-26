'use client'

import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { toggleWishlist } from '@/app/actions/wishlist'
import { useTranslations } from 'next-intl'

export function WishlistButton({ productId }: { productId: string }) {
  const t = useTranslations('Wishlist')
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
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
        // maybeSingle: `single()` treats "no row" as an error, and an empty
        // wishlist is the normal case, not a failure.
        .maybeSingle()
      
      if (mounted) {
        setIsWishlisted(!!data)
        setIsLoading(false)
      }
    }
    checkWishlist()

    return () => { mounted = false }
  }, [productId, supabase])

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error(t('signInFirst'))
      return
    }

    // Optimistic update
    setIsWishlisted(!isWishlisted)
    
    try {
      const res = await toggleWishlist(productId)
      if (res.error) {
        setIsWishlisted(isWishlisted) // revert
        toast.error(res.error)
      } else {
        toast.success(isWishlisted ? t('removed') : t('added'))
      }
    } catch {
      setIsWishlisted(isWishlisted) // revert
      toast.error(t('failed'))
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full bg-background/80 opacity-50" disabled aria-label={t('add')}>
        <Heart className="w-4 h-4 text-muted-foreground" />
      </Button>
    )
  }

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleToggle}
      aria-label={isWishlisted ? t('remove') : t('add')}
      aria-pressed={isWishlisted}
      className={`w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90 transition-colors ${
        isWishlisted ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
    </Button>
  )
}
