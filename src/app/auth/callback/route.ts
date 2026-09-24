import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { safeNextPath, UPDATE_PASSWORD_PATH } from '@/lib/auth-redirect'

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

/**
 * Landing point for every Supabase email link: sign-up confirmation and
 * password recovery.
 *
 * Supabase's default templates send `?code=` (PKCE), which only works in the
 * browser that asked for the email. Custom templates can send
 * `?token_hash=&type=` instead, which works from any device. Both are handled.
 * On success the session cookie is set and the visitor goes to `next`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  // Supabase itself reports expired or reused links this way.
  const linkError = url.searchParams.get('error_description')

  if (!linkError) {
    const supabase = await createClient()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(new URL(next, url.origin))
      console.error('Auth callback: code exchange failed', error.message)
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      if (!error) return NextResponse.redirect(new URL(next, url.origin))
      console.error('Auth callback: OTP verification failed', error.message)
    }
  }

  const failed = new URL('/auth/error', url.origin)
  if (next.startsWith(UPDATE_PASSWORD_PATH)) failed.searchParams.set('flow', 'recovery')
  return NextResponse.redirect(failed)
}
