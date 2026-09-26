'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'

export async function toggleWishlist(productId: string) {
  const [supabase, t] = await Promise.all([createClient(), getTranslations('Wishlist')])

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: t('signInFirst') }
  }

  // Check if it exists
  const { data: existing, error: readError } = await supabase
    .from('wishlist')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productId)
    .maybeSingle()

  if (readError) {
    console.error('Wishlist: read failed', readError)
    return { error: t('failed') }
  }

  // Both branches used to ignore their result and report success regardless.
  const { error } = existing
    ? await supabase.from('wishlist').delete().eq('id', existing.id)
    : await supabase.from('wishlist').insert({ user_id: user.id, product_id: productId })

  // 23505: a double click already added it (unique user_id + product_id) — the
  // wishlist is in the state the shopper asked for, so that is not a failure.
  if (error && error.code !== '23505') {
    console.error('Wishlist: write failed', error)
    return { error: t('failed') }
  }

  // The wishlist page in every language. (The heart on product cards reads
  // its state in the browser, so the page it was clicked on needs nothing.)
  revalidatePath('/[locale]/wishlist', 'page')

  return { success: true }
}
