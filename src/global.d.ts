import type messages from '../messages/en.json'
import type { Locale } from '@/i18n/routing'

// English is the source of truth for message keys: a key used in code but
// missing from en.json fails the typecheck. Spanish and Russian are checked
// against English by src/i18n/messages.test.ts.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof messages
  }
}
