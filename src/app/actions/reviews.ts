'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addReview(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be logged in to leave a review.' }

  const productId = formData.get('product_id') as string
  const rating = parseInt(formData.get('rating') as string)
  const comment = formData.get('comment') as string

  if (!productId || !rating || rating < 1 || rating > 5) {
    return { error: 'Invalid rating or product.' }
  }

  const { error } = await supabase.from('reviews').insert({
    product_id: productId,
    user_id: user.id,
    rating,
    comment
  })

  if (error) {
    console.error('Error adding review:', error)
    return { error: 'Failed to add review.' }
  }

  revalidatePath(`/product/[slug]`, 'page')
  return { success: true }
}
