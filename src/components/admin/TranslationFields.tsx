import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TRANSLATED_LOCALES, type TranslatedLocale } from '@/lib/admin-schemas'
import { LOCALE_NAMES } from '@/i18n/routing'

export type TranslationRow = { locale: string; title?: string | null; name?: string | null; description?: string | null }

const fieldClassName =
  'flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/**
 * Spanish and Russian versions of a product's or category's name and
 * description, sent with the rest of the form (`es.title`, `es.description`,
 * …) and saved in the same transaction. Leaving the name empty removes that
 * language's translation, and the store shows the English text instead.
 */
export function TranslationFields({
  initial,
  nameLabel,
  limits,
}: {
  initial?: TranslationRow[] | null
  /** "Title" for products, "Name" for categories. */
  nameLabel: string
  limits: { title: number; description: number }
}) {
  const byLocale = (locale: TranslatedLocale) => initial?.find((t) => t.locale === locale)

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium mb-1">Translations</legend>
      <p className="text-xs text-muted-foreground">
        Optional. Anything left empty is shown in English on that language&apos;s pages.
      </p>
      {TRANSLATED_LOCALES.map((locale) => {
        const row = byLocale(locale)
        const title = row?.title ?? row?.name ?? ''
        return (
          <details key={locale} className="rounded-lg border px-4 py-3" open={Boolean(title)}>
            <summary className="cursor-pointer text-sm font-medium">
              {LOCALE_NAMES[locale]}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {title ? 'translated' : 'not translated'}
              </span>
            </summary>
            <div className="mt-3 space-y-3" lang={locale}>
              <div className="space-y-2">
                <Label htmlFor={`${locale}-title`}>{nameLabel}</Label>
                <Input
                  id={`${locale}-title`}
                  name={`${locale}.title`}
                  defaultValue={title}
                  maxLength={limits.title}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${locale}-description`}>Description</Label>
                <textarea
                  id={`${locale}-description`}
                  name={`${locale}.description`}
                  defaultValue={row?.description ?? ''}
                  maxLength={limits.description}
                  className={`${fieldClassName} min-h-[90px]`}
                />
              </div>
            </div>
          </details>
        )
      })}
    </fieldset>
  )
}
