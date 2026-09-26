'use client'

import { useTransition } from 'react'
import { Languages } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { LOCALES, LOCALE_NAMES, isLocale } from '@/i18n/routing'

/**
 * Switches the page to another language, staying on the same page with the
 * same filters. A native <select>: keyboard, screen reader and phone behaviour
 * come for free.
 */
export function LocaleSwitcher() {
  const t = useTranslations('Header')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value
    if (!isLocale(next)) return
    // The query string (catalogue filters) is read here rather than with
    // useSearchParams, which would force a Suspense boundary on every page.
    startTransition(() => router.replace(`${pathname}${window.location.search}`, { locale: next }))
  }

  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t('language')}</span>
      <Languages className="pointer-events-none absolute left-2 size-4 text-muted-foreground" aria-hidden="true" />
      <select
        value={locale}
        onChange={onChange}
        disabled={pending}
        className="h-9 cursor-pointer appearance-none rounded-md border border-input bg-background pl-8 pr-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {LOCALES.map((l) => (
          // Each language by its own name, so a visitor who cannot read the
          // current one still finds theirs.
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
