import type { Metadata } from 'next'
import { InfoPage, DEMO_NOTICE } from '@/components/layout/InfoPage'

export const metadata: Metadata = {
  title: 'Shipping & returns',
  description: 'Delivery times, free shipping, 30-day returns and the 1-year warranty.',
}

export default function ShippingReturnsPage() {
  return (
    <InfoPage
      title="Shipping & returns"
      intro="The policy a real NexStore would run — the one the product pages promise."
    >
      <section>
        <h2>Demo store</h2>
        <p>{DEMO_NOTICE}</p>
      </section>

      <section>
        <h2>Shipping</h2>
        <ul>
          <li>Free standard shipping on every order within the EU.</li>
          <li>Orders are dispatched within 1–2 business days and usually arrive 2–5 business days later.</li>
          <li>You can follow each order&apos;s status — paid, shipped, delivered — on your account page.</li>
        </ul>
      </section>

      <section>
        <h2>Returns</h2>
        <ul>
          <li>Return any item within 30 days of delivery, for any reason.</li>
          <li>Items must be unused and in their original packaging.</li>
          <li>Refunds go back to the original payment method once the return arrives.</li>
        </ul>
      </section>

      <section>
        <h2>Warranty</h2>
        <p>
          Every product carries a 1-year warranty against manufacturing defects. This does not
          affect your statutory rights as a consumer in the EU.
        </p>
      </section>
    </InfoPage>
  )
}
