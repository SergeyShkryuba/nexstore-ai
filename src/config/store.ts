/**
 * The store's identity, in one place. Edit the defaults here for a new store,
 * or override any of them per deployment with the environment variables named
 * beside them (set in Vercel; they are read at build time, so redeploy after
 * changing one).
 *
 * The interface texts in messages/*.json say "NexStore"; the name set here
 * replaces it everywhere at load time (src/i18n/store-messages.ts), so renaming
 * the store does not mean editing three language files.
 */

const env = (value: string | undefined) => (value && value.trim() !== '' ? value.trim() : null)

/** "false" turns demo mode off; anything else (or nothing) keeps it on. */
const demo = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase() !== 'false'

export const store = {
  /** Shown in the header, page titles, emails, the assistant and the bots. */
  name: env(process.env.NEXT_PUBLIC_STORE_NAME) ?? 'NexStore',

  /**
   * Demo mode: a portfolio store. It says so in the footer and on the legal
   * pages, has an "About this project" page, and the assistant mentions that
   * orders are test orders. Turn it off for a real shop.
   */
  demo,

  /** A public email address for customers, shown on the contact page. Optional. */
  email: env(process.env.NEXT_PUBLIC_STORE_EMAIL),

  /** The store's Telegram bot, without "@", linked from the contact page and footer. Optional. */
  telegramBot: env(process.env.NEXT_PUBLIC_TELEGRAM_BOT)?.replace(/^@/, '') ?? null,

  /** Social profiles, linked from the footer; unset ones are left out. */
  socials: [
    { label: 'Instagram', url: env(process.env.NEXT_PUBLIC_INSTAGRAM_URL) },
    { label: 'Facebook', url: env(process.env.NEXT_PUBLIC_FACEBOOK_URL) },
    { label: 'TikTok', url: env(process.env.NEXT_PUBLIC_TIKTOK_URL) },
  ].filter((s): s is { label: string; url: string } => s.url !== null),

  /**
   * The source code, linked from the footer and the about page. Leave unset
   * for a private repository: the links are then not shown at all.
   */
  sourceUrl: env(process.env.NEXT_PUBLIC_SOURCE_URL),
} as const

/** The name the message files are written with, replaced by `store.name`. */
export const MESSAGES_STORE_NAME = 'NexStore'
