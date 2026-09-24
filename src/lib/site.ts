const LOCAL_URL = 'http://localhost:3000'

// Same shape as `process.env`, which has no declared keys to match against.
type SiteEnv = Record<string, string | undefined>

/**
 * The site's absolute origin, without a trailing slash.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when it holds a valid URL. On Vercel it may be
 * left out: the production domain comes from the system variable
 * `VERCEL_PROJECT_PRODUCTION_URL` (a bare host name). A variable that is set
 * but empty counts as unset — `new URL('')` used to take the whole build down.
 */
export function resolveSiteUrl(env: SiteEnv = process.env): string {
  const candidates = [
    env.NEXT_PUBLIC_SITE_URL?.trim(),
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim() && `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    } catch {
      // Not a URL; try the next source.
    }
  }

  return LOCAL_URL
}

export const siteUrl = resolveSiteUrl()
