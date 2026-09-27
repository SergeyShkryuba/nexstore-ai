import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from './routing'
import { MESSAGES } from './messages'

/** The interface strings for each request, with the store's name (see src/config/store.ts). */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE
  return { locale, messages: MESSAGES[locale] }
})
