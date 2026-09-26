'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { parseReviewInput } from '@/lib/review-input'
import { MAX_REVIEW_LENGTH } from '@/lib/review-limits'

export async function addReview(formData: FormData) {
  const [supabase, t] = await Promise.all([createClient(), getTranslations('Reviews')])

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t('signInFirst') }

  const parsed = parseReviewInput(formData)
  if (!parsed.ok) return { error: t(`invalid.${parsed.error}`, { max: MAX_REVIEW_LENGTH }) }
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
    if (error.code === '23505') return { error: t('duplicate') }
    console.error('Error adding review:', error)
    return { error: t('failed') }
  }

  revalidatePath('/[locale]/product/[slug]', 'page')
  return { success: true }
}
