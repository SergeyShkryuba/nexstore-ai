'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleWishlist(productId: string, currentPath: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be logged in to add to wishlist' }
  }

  // Check if it exists
  const { data: existing } = await supabase
    .from('wishlist')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productId)
    .single()

  if (existing) {
    // Remove it
    await supabase.from('wishlist').delete().eq('id', existing.id)
  } else {
    // Add it
    await supabase.from('wishlist').insert({
      user_id: user.id,
      product_id: productId
    })
  }

  revalidatePath(currentPath)
  revalidatePath('/wishlist')
  
  return { success: true }
}
