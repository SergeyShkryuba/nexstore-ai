import { MESSAGES } from '@/i18n/messages'
import type { Locale } from '@/i18n/routing'

type Section = { heading: string; demo?: boolean; paragraphs?: readonly string[]; items?: readonly string[] }

/**
 * An info page's prose as plain text, without the page's <b>/<link> tags,
 * read from the same message file as the page itself so the assistants
 * cannot drift from what the site promises. The demo notice is left out.
 */
export function infoPageText(page: 'shipping' | 'terms', locale: Locale): string {
  const strip = (s: string) => s.replace(/<\/?(?:b|link)>/g, '')
  const sections = MESSAGES[locale].Pages[page].sections as readonly Section[]
  return sections
    .filter((s) => s.paragraphs || s.items)
    .map((s) =>
      [`${s.heading}:`, ...(s.paragraphs ?? []).map(strip), ...(s.items ?? []).map((i) => `- ${strip(i)}`)].join('\n'),
    )
    .join('\n\n')
}
