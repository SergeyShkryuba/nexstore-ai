import type { Metadata } from 'next'
import { InfoPage } from '@/components/layout/InfoPage'

export const metadata: Metadata = {
  title: 'About this project',
  description: 'How NexStore AI is built: hybrid semantic search, Supabase, Stripe and Next.js.',
}

const REPO_URL = 'https://github.com/SergeyShkryuba/nexstore-ai'

export default function AboutPage() {
  return (
    <InfoPage
      title="About this project"
      intro="NexStore AI is a full-stack e-commerce storefront, built as a portfolio project. It is a real, working application — not a clickable mockup — but it is not running a business."
    >
      <section>
        <h2>What is worth a look</h2>
        <ul>
          <li>
            <strong>Search by meaning.</strong> Queries are embedded with the gte-small model and
            matched against the catalogue with pgvector, then fused with a keyword ranker. &ldquo;Film
            my surfing trip&rdquo; finds the action camera without sharing a word with it.
          </li>
          <li>
            <strong>A checkout you cannot tamper with.</strong> The browser sends only product ids and
            quantities; prices are re-read from the database before Stripe sees them.
          </li>
          <li>
            <strong>Row-level security everywhere.</strong> Every table is protected in Postgres itself,
            not only in the UI.
          </li>
          <li>
            <strong>An admin panel</strong> for products, photos, stock and order status.
          </li>
        </ul>
      </section>

      <section>
        <h2>Stack</h2>
        <p>
          Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth,
          Storage, Edge Functions, pgvector) · Stripe · Zod · Vitest, deployed on Vercel.
        </p>
      </section>

      <section>
        <h2>Source</h2>
        <p>
          The code, architecture notes and known limitations are on{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
      </section>
    </InfoPage>
  )
}
