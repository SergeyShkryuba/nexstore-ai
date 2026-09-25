'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseReviewInput } from '@/lib/review-input'

export async function addReview(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be logged in to leave a review.' }

  const parsed = parseReviewInput(formData)
  if (!parsed.ok) return { error: parsed.error }
  const { productId, rating, comment } = parsed.review

  // `verified_purchase` is not sent: a database trigger sets it from the
  // author's paid orders, whatever the request says.
  const { error } = await supabase.from('reviews').insert({
    product_id: productId,
    user_id: user.id,
    rating,
    comment,
  })

  if (error) {
    // unique (product_id, user_id): one review per person per product.
    if (error.code === '23505') return { error: 'You have already reviewed this product.' }
    console.error('Error adding review:', error)
    return { error: 'Failed to add review.' }
  }

  revalidatePath(`/product/[slug]`, 'page')
  return { success: true }
}
