# NexStore AI

A full-stack e-commerce storefront built with Next.js 16 (App Router), React 19,
TypeScript, Tailwind CSS v4 and Supabase, with Stripe Checkout for payments.

> **Portfolio project.** It is a real, working application — not a clickable
> mockup — but it is not running a business. Where something is simulated, this
> README says so explicitly.

| | |
|---|---|
| **Live demo** | _add your Vercel URL here_ |
| **Stack** | Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Stripe · Zustand · Zod · Vitest |
| **CI** | Typecheck, ESLint, unit tests and a production build on every push |

---

## What it does

- **Catalogue search** — free-text queries are tokenised, stemmed and scored
  against title, attributes and description, with budget parsing
  (`"smart home under 60"`). Returns nothing when nothing matches.
- **Cart** — client-side, persisted to `localStorage`, hydration-safe.
- **Checkout** — Stripe Checkout Session. **Prices are re-read from the database
  server-side**; the client only sends product ids and quantities.
- **Orders** — written by the Stripe webhook using the service-role key,
  idempotent on `stripe_session_id`, with stock decremented after payment.
- **Auth** — Supabase email/password, session refreshed in `src/proxy.ts`.
- **Wishlist & reviews** — per-user, enforced by Row Level Security. Product
  rating is computed from the reviews that actually exist.
- **Admin panel** — dashboard and product creation, gated on `profiles.role`
  both in the UI and in the RLS policies.

## Architecture notes

**Rendering.** Catalogue pages (`/`, `/categories/[slug]`, `/product/[slug]`)
use a cookie-free Supabase client and are statically prerendered with ISR
(`revalidate = 300`). Pages with per-user content (`/profile`, `/wishlist`,
`/admin`) use the cookie-bound client and render on demand. Reading `cookies()`
opts a route out of static rendering, so the two clients are kept deliberately
separate — `src/utils/supabase/public.ts` vs `src/utils/supabase/server.ts`.

**Trust boundary.** Anything the browser sends is untrusted. `POST /api/checkout`
accepts `{ id, quantity }[]`, validates it with Zod, then loads titles, prices
and stock from Postgres and builds the Stripe line items from those. Sending a
tampered price has no effect.

**Row Level Security** is on for every table. `order_items` is readable only
through its parent order, wishlists are strictly private, and admin access is
resolved by a `SECURITY DEFINER` `is_admin()` function so the policy does not
recurse through the `profiles` policies.

**Search** (`src/lib/search.ts`) is a pure module with no framework imports, so
the ranking is unit-testable without a database. The scoring is **lexical**, not
semantic: field-weighted term matching with saturating counts, a coverage
multiplier and an exact-phrase bonus. Real semantic search would mean embedding
the catalogue with `pgvector` and doing a nearest-neighbour query — that is a
different project, and this README does not pretend otherwise.

**Fonts** are self-hosted through `@fontsource-variable/*` rather than
`next/font/google`, so builds do not depend on reaching fonts.googleapis.com
and no visitor request leaves for a third party.

## Getting started

```bash
git clone https://github.com/SergeyShkryuba/nexstore-ai.git
cd nexstore-ai
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

### Database

Create a Supabase project, then run the two SQL files in the SQL editor:

```
supabase/schema.sql   # tables, triggers, functions, RLS policies (idempotent)
supabase/seed.sql     # demo catalogue (upsert, safe to re-run)
```

To make yourself an admin:

```sql
update profiles set role = 'admin' where id = '<your auth.users id>';
```

**Keep-alive.** A free Supabase project is paused after about a week without
traffic, and one paused for 90 days cannot be restored. `vercel.json` schedules
a daily Vercel Cron call to `GET /api/keepalive`, which makes one cheap read.
Set `CRON_SECRET` in the Vercel project so only the scheduler can call it.

### Stripe (optional)

Without `STRIPE_SECRET_KEY` the app runs fine and checkout returns a clear
"not configured" message instead of failing obscurely. With it:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

and put the printed signing secret in `STRIPE_WEBHOOK_SECRET`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run verify` | All of the above, in the order CI runs them |

## Tests

`npm test` covers the parts where a bug would be silent:

- `src/lib/search.test.ts` — stemming, stop words, budget parsing, ranking
  order, and the guarantee that an unmatched query returns nothing.
- `src/store/useCartStore.test.ts` — quantity merging, removal at zero,
  totals, and that re-adding an item cannot overwrite its stored price.
- `src/components/product/ProductCard.test.tsx` — rendering, the add-to-cart
  path against the real store, and the missing-image fallback.
- `src/lib/format.test.ts` — currency formatting and rating averages.

## Known limitations

Listed rather than hidden:

- Search is lexical, not semantic or LLM-backed.
- No order management UI in the admin panel (orders are visible in `/profile`).
- Stock is decremented after payment, not reserved at checkout, so a race
  between two buyers of the last unit is possible.
- No end-to-end tests; the Stripe webhook is covered by manual `stripe listen`
  testing rather than automated tests.

## Licence

MIT
