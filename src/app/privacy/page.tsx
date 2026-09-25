import type { Metadata } from 'next'
import { InfoPage, DEMO_NOTICE } from '@/components/layout/InfoPage'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What NexStore AI stores about you, where, and why.',
}

const ISSUES_URL = 'https://github.com/SergeyShkryuba/nexstore-ai/issues'

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" intro="Short, because the store collects very little.">
      <section>
        <h2>Demo store</h2>
        <p>{DEMO_NOTICE}</p>
      </section>

      <section>
        <h2>What is stored</h2>
        <ul>
          <li>
            <strong>Your account</strong> — email address and, if you give one, your name. Held by
            Supabase Auth.
          </li>
          <li>
            <strong>Your activity</strong> — orders, wishlist and reviews, tied to your account in the
            store&apos;s Supabase database. Row-level security means only you (and the store admin, for
            orders) can read them.
          </li>
          <li>
            <strong>Your cart</strong> — kept in your own browser&apos;s local storage, not on a server.
          </li>
          <li>
            <strong>Search queries</strong> — processed to find products and not saved.
          </li>
          <li>
            <strong>Request counters</strong> — to stop floods of checkout and search requests, the
            store counts requests per visitor for a few minutes. It stores a one-way keyed hash of your
            IP address (or account id), never the address itself, and deletes the counters within a
            day.
          </li>
          <li>
            <strong>Error reports</strong> — if the deployment has error monitoring (Sentry) turned
            on, a crash report records the page, browser type and the technical error. Cookies, IP
            addresses, email addresses, form contents and URL query strings are removed before it is
            sent.
          </li>
        </ul>
      </section>

      <section>
        <h2>Payments</h2>
        <p>
          Checkout happens on Stripe&apos;s own page. Card details go straight to Stripe and never pass
          through this store&apos;s servers.
        </p>
      </section>

      <section>
        <h2>Cookies and tracking</h2>
        <p>
          The only cookies are the ones that keep you signed in. There is no analytics, no advertising
          and no third-party tracking; the error reports above are the only thing that may go to a third
          party. Fonts are self-hosted, so loading a page does not contact Google.
        </p>
      </section>

      <section>
        <h2>Deleting your data</h2>
        <p>
          To have your account and everything tied to it removed, open an issue on the{' '}
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            project&apos;s GitHub
          </a>
          .
        </p>
      </section>
    </InfoPage>
  )
}
