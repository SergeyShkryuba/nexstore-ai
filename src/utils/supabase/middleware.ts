import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { localizedPath, splitLocale } from '@/i18n/routing'

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }

/**
 * Refreshes the Supabase session and applies the access rules, then lets
 * `respond` build the actual response (the locale middleware's rewrite or
 * redirect, or a plain pass-through) and puts the refreshed cookies on it.
 *
 * `respond` runs after the refresh on purpose: refreshed cookies are written
 * into the request first, so the response it builds forwards them to the page
 * being rendered, not the stale ones.
 */
export async function updateSession(
  request: NextRequest,
  respond: (request: NextRequest) => NextResponse = (req) => NextResponse.next({ request: req }),
) {
  const refreshed: CookieToSet[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            refreshed.push({ name, value, options })
          })
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const withCookies = (response: NextResponse) => {
    refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    return response
  }

  // The rules apply to the page, whatever language it is asked for in:
  // `/es/admin` and `/en/admin` are the admin panel as much as `/admin` is.
  // Matching the raw path would let a locale prefix walk straight past them.
  const { locale, path } = splitLocale(request.nextUrl.pathname)

  // Redirect home (in the visitor's language), keeping any refreshed session
  // cookies: dropping them here would sign the visitor out on the way.
  const toHome = () => {
    const url = request.nextUrl.clone()
    url.pathname = localizedPath('/', locale)
    url.search = ''
    return withCookies(NextResponse.redirect(url))
  }

  if (!user && (path === '/profile' || path.startsWith('/profile/'))) return toHome()

  // The admin role is checked here, before anything renders. A check in
  // app/[locale]/admin/layout.tsx alone is not enough: Next renders a page in
  // parallel with its layout, so an admin page still ran and streamed its
  // content to signed-out visitors even though the layout then redirected them.
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!user) return toHome()
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return toHome()
  }

  return withCookies(respond(request))
}
