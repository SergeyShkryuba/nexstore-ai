'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, ShoppingCart, Tags } from 'lucide-react'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/categories', label: 'Categories', icon: Tags },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
]

/** Vertical in the sidebar, a scrollable row on small screens. */
export function AdminNav({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Admin"
      className={cn(orientation === 'vertical' ? 'space-y-1' : 'flex gap-1 overflow-x-auto')}
    >
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted',
              active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
