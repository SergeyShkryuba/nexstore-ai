'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { loggable } from '@/lib/log'

export type DeleteAccountResult = { success: true } | { error: 'unauthorized' | 'unavailable' | 'failed' }

/**
 * Deletes the signed-in user's account: the right to erasure, without having
 * to ask anyone.
 *
 * Goes with it: the login (email, password), the profile, the wishlist and
 * reviews (cascades in schema.sql), and support requests, which hold the email
 * and messages. Stays: orders, unlinked from the account (`on delete set null`),
 * as the shop's sales records.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' }

  const service = createServiceClient()
  if (!service) return { error: 'unavailable' }

  const { error: supportError } = await service.from('support_requests').delete().eq('user_id', user.id)
  if (supportError) {
    console.error('Delete account: support requests not removed', loggable(supportError))
    return { error: 'failed' }
  }

  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('Delete account: user not removed', loggable(error))
    return { error: 'failed' }
  }

  // The user no longer exists; only this browser's session cookies remain.
  await supabase.auth.signOut({ scope: 'local' })
  return { success: true }
}
