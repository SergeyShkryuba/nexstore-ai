import { createTranslator } from 'next-intl'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import ru from '../../messages/ru.json'
import { DEFAULT_LOCALE, isLocale, type Locale } from './routing'
import { storeMessages } from './store-messages'

type Messages = typeof en

/**
 * All interface strings, by language, as this store shows them (its name, and
 * no demo notices outside demo mode: see src/config/store.ts). es/ru are
 * checked against en by src/i18n/messages.test.ts.
 */
export const MESSAGES: Record<Locale, Messages> = {
  en: storeMessages(en),
  es: storeMessages(es as Messages),
  ru: storeMessages(ru as Messages),
}

/**
 * A translator for code that runs outside a rendered page — API routes, which
 * have no locale from the URL and are not wrapped by next-intl's request
 * context. The caller says the language (the client sends it); anything
 * unexpected falls back to English.
 */
export function translatorFor(locale: unknown) {
  const resolved: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE
  return { locale: resolved, t: createTranslator({ locale: resolved, messages: MESSAGES[resolved] }) }
}
