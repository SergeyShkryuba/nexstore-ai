import { ChevronRight } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isLocale, localizedPath } from '@/i18n/routing'
import { breadcrumbJsonLd, serializeJsonLd, type Crumb } from '@/lib/structured-data'
import { siteUrl } from '@/lib/site'

/**
 * The visible trail and its BreadcrumbList markup, from one list, so what
 * search engines read can never drift from what visitors see. The last crumb
 * is the current page. Paths are the unprefixed ones; both the links and the
 * markup get the page's language prefix.
 */
export async function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const [rawLocale, t] = await Promise.all([getLocale(), getTranslations('Breadcrumbs')])
  const locale = isLocale(rawLocale) ? rawLocale : 'en'
  const localized = crumbs.map((c) => ({ ...c, path: localizedPath(c.path, locale) }))

  return (
    <nav aria-label={t('label')} className="mb-6 text-sm">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd(localized, siteUrl)) }}
      />
      <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        {crumbs.map((crumb, i) => {
          const current = i === crumbs.length - 1
          return (
            <li key={crumb.path} className="flex items-center gap-1.5 min-w-0">
              {current ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {crumb.name}
                </span>
              ) : (
                <>
                  <Link href={crumb.path} className="hover:text-foreground">
                    {crumb.name}
                  </Link>
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
