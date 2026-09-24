import type { Metadata } from 'next'
import { InfoPage, DEMO_NOTICE } from '@/components/layout/InfoPage'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms for using the NexStore AI demo store.',
}

export default function TermsPage() {
  return (
    <InfoPage title="Terms of use">
      <section>
        <h2>A demo, not a shop</h2>
        <p>{DEMO_NOTICE}</p>
        <p className="mt-3">
          Placing an order here creates a test order only. No contract of sale is formed and nothing
          will be delivered.
        </p>
      </section>

      <section>
        <h2>Products and prices</h2>
        <p>
          Product names, descriptions, stock levels and prices are sample data. Photos come from
          Unsplash and are used under the Unsplash License.
        </p>
      </section>

      <section>
        <h2>Accounts and reviews</h2>
        <ul>
          <li>Keep your sign-in details to yourself; you are responsible for activity on your account.</li>
          <li>Reviews must be your own and must not be abusive or unlawful. They may be removed.</li>
          <li>Test data, including accounts, may be reset at any time.</li>
        </ul>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          The site is provided as is, without any guarantee that it is available, accurate or free of
          errors.
        </p>
      </section>
    </InfoPage>
  )
}
