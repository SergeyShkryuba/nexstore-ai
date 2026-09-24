import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
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

  const path = request.nextUrl.pathname

  // Redirect home, keeping any refreshed session cookies: dropping them here
  // would sign the visitor out on the way.
  const toHome = () => {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user && path.startsWith('/profile')) return toHome()

  // The admin role is checked here, before anything renders. A check in
  // app/admin/layout.tsx alone is not enough: Next renders a page in parallel
  // with its layout, so an admin page still ran and streamed its content to
  // signed-out visitors even though the layout then redirected them.
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!user) return toHome()
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return toHome()
  }

  return supabaseResponse
}
