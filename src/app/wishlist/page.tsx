import { createClient } from '@/utils/supabase/server'
import { ProductCard } from '@/components/product/ProductCard'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Heart } from 'lucide-react'

export default async function WishlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch wishlist items
  const { data: wishlistItems } = await supabase
    .from('wishlist')
    .select('product_id')
    .eq('user_id', user.id)

  const productIds = wishlistItems?.map(item => item.product_id) || []

  let products = []
  if (productIds.length > 0) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds)
    products = data || []
  }

  return (
    <div className="container mx-auto px-4 py-12 min-h-[60vh]">
      <div className="flex items-center space-x-3 mb-8">
        <Heart className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">Your Wishlist</h1>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-lg border border-dashed">
          <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Your wishlist is empty</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Save items you love here to easily find them later.
          </p>
          <Link href="/">
            <Button>Start Shopping</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
