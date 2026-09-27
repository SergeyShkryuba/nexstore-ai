import { getTranslations } from 'next-intl/server'
import { Code, Lock } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import type { NavCategory } from '@/lib/nav-categories'
import { store } from '@/config/store'

const BUDGET = 50

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

export async function Footer({ categories }: { categories: NavCategory[] }) {
  const t = await getTranslations('Footer')

  const shopLinks = [
    { href: '/categories/all', label: t('allProducts') },
    ...categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name })),
    { href: `/categories/all?sort=price-asc&max=${BUDGET}&stock=1`, label: t('underBudget', { amount: BUDGET }) },
  ]
  const accountLinks = [
    { href: '/profile', label: t('myAccount') },
    { href: '/wishlist', label: t('wishlist') },
    { href: '/cart', label: t('cart') },
  ]
  const helpLinks = [
    { href: '/contact', label: t('contact') },
    { href: '/help/shipping-returns', label: t('shippingReturns') },
    { href: '/privacy', label: t('privacy') },
    { href: '/terms', label: t('terms') },
    // About the portfolio project: only a demo store has one.
    ...(store.demo ? [{ href: '/about', label: t('about') }] : []),
  ]
  const profiles = [
    ...(store.telegramBot ? [{ label: 'Telegram', url: `https://t.me/${store.telegramBot}` }] : []),
    ...store.socials,
  ]

  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <Link href="/" className="text-lg font-bold">
              {store.name}
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t('tagline')}</p>
            {store.demo && <p className="mt-4 max-w-xs text-xs text-muted-foreground">{t('demoNotice')}</p>}
            {profiles.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {profiles.map((p) => (
                  <li key={p.url}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {p.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {store.sourceUrl && (
              <a
                href={store.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Code className="size-4" aria-hidden="true" />
                {t('source')}
              </a>
            )}
          </div>

          <FooterColumn title={t('shop')} links={shopLinks} />
          <FooterColumn title={t('account')} links={accountLinks} />
          <FooterColumn title={t('help')} links={helpLinks} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <p className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            {t('secureCheckout')}
          </p>
        </div>
      </div>
    </footer>
  )
}
