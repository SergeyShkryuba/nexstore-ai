import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/utils/supabase/middleware'

const intl = createIntlMiddleware(routing)

/**
 * Every request refreshes the Supabase session and passes the access rules.
 * Pages then go through the locale middleware (`/es/cart` → the Spanish cart,
 * `/` → a visitor's preferred language on first visit). API routes, the auth
 * callback and files (`robots.txt`, `sitemap.xml`) have no language and are
 * left alone: rewriting them to `/en/...` would 404.
 */
export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const hasNoLocale = path.startsWith('/api/') || path.startsWith('/auth/callback') || /\.[^/]+$/.test(path)
  return hasNoLocale ? updateSession(request) : updateSession(request, intl)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
