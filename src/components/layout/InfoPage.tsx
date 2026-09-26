import type { Metadata } from 'next'
import { Fragment } from 'react'
import { MESSAGES } from '@/i18n/messages'
import type { Locale } from '@/i18n/routing'
import { alternates } from '@/lib/seo'

/**
 * The footer's text pages (about, privacy, terms, shipping). Their prose lives
 * in the message files as a small structure — title, intro, sections of
 * paragraphs and bullet items — so each language is one block of text rather
 * than dozens of keys. Two tags are understood inside a string: <b>…</b> and
 * <link>…</link> (the page's one external link). Everything else is text:
 * nothing is rendered as HTML.
 */

export type InfoPageKey = 'about' | 'privacy' | 'terms' | 'shipping'

type Section = { heading: string; demo?: boolean; paragraphs?: string[]; items?: string[] }
type PageContent = { title: string; intro?: string; metaDescription: string; sections: readonly Section[] }

const PATHS: Record<InfoPageKey, string> = {
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
  shipping: '/help/shipping-returns',
}

/** Splits on the two supported tags; unknown markup stays literal text. */
export function RichText({ text, href }: { text: string; href?: string }) {
  const parts = text.split(/(<b>.*?<\/b>|<link>.*?<\/link>)/g)
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.match(/^<b>(.*)<\/b>$/)
        if (bold) return <strong key={i}>{bold[1]}</strong>
        const link = part.match(/^<link>(.*)<\/link>$/)
        if (link) {
          return href ? (
            <a key={i} href={href} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          ) : (
            <Fragment key={i}>{link[1]}</Fragment>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

// Read straight from the message files: the pages are structured data (lists,
// flags), not single ICU messages, and nothing in them is interpolated.
function content(page: InfoPageKey, locale: Locale): { page: PageContent; demoNotice: string } {
  const pages = MESSAGES[locale].Pages
  return { page: pages[page], demoNotice: pages.demoNotice }
}

export async function infoPageMetadata(page: InfoPageKey, locale: Locale): Promise<Metadata> {
  const { page: c } = content(page, locale)
  return { title: c.title, description: c.metaDescription, alternates: alternates(PATHS[page], locale) }
}

export async function InfoPage({ page, locale, href }: { page: InfoPageKey; locale: Locale; href?: string }) {
  const { page: c, demoNotice } = content(page, locale)

  return (
    <div className="container mx-auto px-4 py-12">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">{c.title}</h1>
        {c.intro && <p className="mt-4 text-lg text-muted-foreground">{c.intro}</p>}
        <div className="mt-10 space-y-8 leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:space-y-2 [&_p+p]:mt-3">
          {c.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.demo && <p>{demoNotice}</p>}
              {section.paragraphs?.map((text) => (
                <p key={text}>
                  <RichText text={text} href={href} />
                </p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map((text) => (
                    <li key={text}>
                      <RichText text={text} href={href} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
