import Link from 'next/link'
import { Code, Lock } from 'lucide-react'
import type { NavCategory } from '@/lib/nav-categories'

const REPO_URL = 'https://github.com/SergeyShkryuba/nexstore-ai'

const ACCOUNT_LINKS = [
  { href: '/profile', label: 'My account' },
  { href: '/wishlist', label: 'Wishlist' },
  { href: '/cart', label: 'Cart' },
]

const HELP_LINKS = [
  { href: '/help/shipping-returns', label: 'Shipping & returns' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/about', label: 'About this project' },
]

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Footer({ categories }: { categories: NavCategory[] }) {
  const shopLinks = [
    { href: '/categories/all', label: 'All products' },
    ...categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name })),
    { href: '/categories/all?sort=price-asc&max=50&stock=1', label: 'Under €50' },
  ]

  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <Link href="/" className="text-lg font-bold">
              NexStore AI
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              A storefront you can search in your own words — by meaning, not only by keywords.
            </p>
            <p className="mt-4 max-w-xs text-xs text-muted-foreground">
              Portfolio demo: nothing is shipped and payments run in Stripe test mode.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Code className="size-4" aria-hidden="true" />
              Source on GitHub
            </a>
          </div>

          <FooterColumn title="Shop" links={shopLinks} />
          <FooterColumn title="Account" links={ACCOUNT_LINKS} />
          <FooterColumn title="Help" links={HELP_LINKS} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} NexStore AI. Built with Next.js, Supabase and Stripe.</p>
          <p className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            Secure checkout by Stripe · Prices in EUR
          </p>
        </div>
      </div>
    </footer>
  )
}
