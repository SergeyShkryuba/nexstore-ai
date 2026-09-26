import Link from 'next/link'
import './globals.css'

/**
 * For URLs the locale middleware never sees (it skips paths that look like
 * files). Every other unknown page gets the localised
 * `app/[locale]/not-found.tsx` with the full header and footer.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center font-sans antialiased">
        <h1 className="text-3xl font-bold">Page not found</h1>
        {/* Plain next/link: outside [locale] there is no language to add; the
            proxy sends "/" to the visitor's language. */}
        <Link href="/" className="underline underline-offset-4">
          Back to NexStore AI
        </Link>
      </body>
    </html>
  )
}
