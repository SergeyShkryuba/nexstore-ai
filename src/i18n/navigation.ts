import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/**
 * Locale-aware drop-ins for next/link and next/navigation: `<Link href="/cart">`
 * points at `/es/cart` on the Spanish site. Use these for every internal link.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
