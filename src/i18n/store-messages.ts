import { MESSAGES_STORE_NAME, store } from '@/config/store'

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function rename(value: Json, name: string): Json {
  if (typeof value === 'string') return value.replaceAll(MESSAGES_STORE_NAME, name)
  if (Array.isArray(value)) return value.map((v) => rename(v, name))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v, name)]))
  return value
}

type Section = { demo?: boolean }
type Page = { intro?: string; metaDescription?: string; sections?: Section[] }
type Pages = Record<string, Page | string>

/**
 * The message files as this store shows them: its name in place of
 * "NexStore", and, outside demo mode, without the demo notices.
 */
export function storeMessages<T>(messages: T, options: { name: string; demo: boolean } = store): T {
  let out = (options.name === MESSAGES_STORE_NAME ? messages : rename(messages as Json, options.name)) as Record<
    string,
    unknown
  >
  if (!options.demo) {
    out = structuredClone(out)
    const pages = out.Pages as Pages | undefined
    if (pages) {
      for (const page of Object.values(pages)) {
        if (typeof page !== 'object' || !page.sections) continue
        page.sections = page.sections.filter((s) => !s.demo)
      }
      // "The policy a real NexStore would run" only makes sense for the demo.
      const shipping = pages.shipping
      if (typeof shipping === 'object') delete shipping.intro
      // Not shown outside demo mode, but every message reaches the browser.
      pages.demoNotice = ''
      const about = pages.about
      if (typeof about === 'object') Object.assign(about, { intro: '', metaDescription: '', sections: [] })
    }
    const footer = out.Footer as Record<string, string> | undefined
    if (footer) footer.demoNotice = ''
    // The portfolio's description ("a full-stack Next.js storefront") gives way to the store's tagline.
    const metadata = out.Metadata as Record<string, string> | undefined
    if (metadata) metadata.description = metadata.tagline
  }
  return out as T
}
