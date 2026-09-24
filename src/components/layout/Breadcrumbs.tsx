import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { breadcrumbJsonLd, serializeJsonLd, type Crumb } from '@/lib/structured-data'
import { siteUrl } from '@/lib/site'

/**
 * The visible trail and its BreadcrumbList markup, from one list, so what
 * search engines read can never drift from what visitors see. The last crumb
 * is the current page.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd(crumbs, siteUrl)) }}
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
