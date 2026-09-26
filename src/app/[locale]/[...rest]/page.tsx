import { notFound } from 'next/navigation'

/**
 * Any path under a locale that matches no page (`/es/nope`) lands here, so it
 * gets the localised not-found page inside the site's layout.
 */
export default function CatchAll() {
  notFound()
}
