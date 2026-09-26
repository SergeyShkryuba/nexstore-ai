# NexStore AI

A full-stack e-commerce storefront built with Next.js 16 (App Router), React 19,
TypeScript, Tailwind CSS v4 and Supabase, with Stripe Checkout for payments.

> **Portfolio project.** It is a real, working application — not a clickable
> mockup — but it is not running a business. Where something is simulated, this
> README says so explicitly.

| | |
|---|---|
| **Live demo** | [nexstore-ai.vercel.app](https://nexstore-ai.vercel.app) |
| **Stack** | Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Stripe · Zustand · Zod · Vitest |
| **CI** | Typecheck, ESLint, unit tests and a production build on every push |

---

## What it does

- **Hybrid search** — semantic (pgvector nearest neighbours over gte-small
  embeddings) fused with a lexical ranker, with budget parsing
  (`"smart home under 60"`). `"film my surfing trip"` finds the action camera
  without sharing a word with it; `"kitchen knife"` returns nothing, because
  the shop sells none.
- **Catalogue browsing** — sort, price range and in-stock filters kept in the
  URL; product pages with an image gallery.
- **Cart** — client-side, persisted to `localStorage`, hydration-safe.
- **Checkout** — Stripe Checkout Session with EU shipping address and phone.
  **Prices are re-read from the database server-side**; the client only sends
  product ids and quantities.
- **Stock reservations** — checkout holds the units for the life of the Stripe
  session, so two buyers cannot both get the last one. Paying turns the hold
  into the sale; an expired or failed payment puts the units back.
- **Orders** — written by the Stripe webhook in one Postgres transaction (order,
  lines, stock), idempotent on `stripe_session_id`, so a retried webhook can
  neither duplicate an order nor move stock twice.
- **Auth** — Supabase email/password, session refreshed in `src/proxy.ts`.
- **Wishlist & reviews** — per-user, enforced by Row Level Security. Product
  rating is computed from the reviews that actually exist.
- **Three languages** — English, Spanish and Russian: the interface, the
  catalogue (titles, descriptions, specifications, categories), Stripe's
  payment page, prices and dates, with a language switcher in the header.
- **Admin panel** — dashboard and product creation, gated on `profiles.role`
  both in the UI and in the RLS policies.
- **Abuse limits** — checkout and search are rate-limited per visitor, one
  shopper can hold at most three checkouts open, and an order takes at most ten
  of one item, so nobody can take the shelf off sale by opening checkouts.
- **Error monitoring** — optional Sentry, scrubbed of cookies, IPs, emails,
  query strings and anything shaped like a key before it leaves.

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

**Rate limiting** (`src/lib/rate-limit.ts`, `rate_limit_hit()` in
`schema.sql`). Serverless instances share no memory, so the counters live in
Postgres: one atomic upsert per request into a fixed window, 10 checkouts per
10 minutes and 30 searches per minute per IP. Keys are HMACs of the IP (or
account id), so the table holds no addresses; the daily cron deletes old
windows. The limiter fails open — if the counter is unreachable, the request
goes through and the error is logged. Separately, `reserve_stock()` refuses a
fourth open checkout from the same shopper, under a per-shopper advisory lock
so parallel requests cannot all slip under the cap.

**Content Security Policy** (`next.config.ts`). Static, not nonce-based: a
nonce forces every page to render per request, which would give up ISR. So
inline scripts are allowed (the App Router streams its payload in them), and
the policy's work is everywhere else: `connect-src` and `img-src` reach only
this site, Supabase and Sentry, and there is no framing, no plugins, no
`<base>` and no cross-site form posts.

**Error monitoring** (`src/instrumentation.ts`, `src/instrumentation-client.ts`,
`src/lib/sentry.ts`). Set `NEXT_PUBLIC_SENTRY_DSN` to turn it on; unset, the SDK
is never imported and adds nothing to the bundle. The server also reports
errors that routes catch and log with `console.error`, since those are most of
the failures that matter (a declined webhook, an unreachable database). Every
event passes a scrubber first; it is unit-tested.

**Row Level Security** is on for every table. `order_items` is readable only
through its parent order, wishlists are strictly private, and admin access is
resolved by a `SECURITY DEFINER` `is_admin()` function so the policy does not
recurse through the `profiles` policies.

**Search** runs two rankers in parallel and fuses them.

- *Lexical* (`src/lib/search.ts`): field-weighted term matching with saturating
  counts, a coverage multiplier and an exact-phrase bonus.
- *Semantic*: the query (minus its budget phrase) is embedded by a Supabase Edge
  Function running the built-in gte-small model (`supabase/functions/embed`),
  and `match_products()` returns the nearest products by cosine similarity from
  an HNSW index. Product vectors live in their own `product_embeddings` table,
  so catalogue queries never ship them to the browser. The function accepts
  only the service-role key, so it cannot be called with the public anon key
  around the search route's rate limit.
- *Fusion* (`src/lib/hybrid.ts`): reciprocal rank fusion, since the two scores
  are on unrelated scales. Semantic matches must clear 0.80 similarity *and* be
  within 0.05 of the best match — thresholds calibrated on the demo catalogue,
  where on-topic matches score 0.80–0.92 and the best match for things the shop
  does not sell stays under 0.80.

If the Edge Function is slow or down, search falls back to lexical ranking and
the UI says so. All three modules are pure and unit-tested without a database.

**Languages** ([next-intl](https://next-intl.dev)). English keeps the
unprefixed URLs it always had (`/product/x`); Spanish and Russian live under
`/es/...` and `/ru/...`, and `/` sends a first-time visitor to the language
their browser asks for. Every page sits under `app/[locale]`, and the
catalogue is still prerendered with ISR — once per language.

- *Interface strings* are in `messages/{en,es,ru}.json`. English is the source
  of truth: a key missing from `en.json` fails the typecheck, and a test fails
  if Spanish or Russian lacks a key, a `{placeholder}` or a tag that English
  has. Plurals use ICU, so Russian gets its three forms.
- *Catalogue text* is in `product_translations` / `category_translations`
  (Spanish and Russian; English is the row itself), edited in the admin
  forms through `save_product()` / `save_category()`, so a product and its
  translations are saved together or not at all. Queries embed a row's
  translations and `src/lib/localized.ts` picks the visitor's, falling back to
  English field by field, so a new product appears in every language at once.
- *Search* ranks against the visitor's language and reads budgets in all three
  ("under 60", "menos de 60", "до 60"). Its semantic half stays English.
- *Access rules* in `src/proxy.ts` compare the path without its language
  prefix (and normalised), so `/es/admin` is as closed as `/admin`.
- *Stripe* opens in the visitor's language, with translated line names, and
  returns them to the same language.

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

For semantic search, deploy the Edge Function (dashboard → Edge Functions →
new function `embed`, paste `supabase/functions/embed/index.ts`; or
`npx supabase functions deploy embed`), then embed the catalogue:

```bash
npm run embed:catalogue   # needs SUPABASE_SERVICE_ROLE_KEY; skips unchanged products
```

Products created in the admin panel are embedded on creation. Without the
function, search still works — lexically.

To make yourself an admin:

```sql
update profiles set role = 'admin' where id = '<your auth.users id>';
```

**Keep-alive.** A free Supabase project is paused after about a week without
traffic, and one paused for 90 days cannot be restored. `vercel.json` schedules
a daily Vercel Cron call to `GET /api/keepalive`, which makes one cheap read.
Set `CRON_SECRET` in the Vercel project so only the scheduler can call it.
The same call releases expired stock reservations and deletes old
rate-limit counters.

**Updating an existing database.** `schema.sql` is idempotent: re-run the
whole file in the SQL editor *before* deploying code that needs it. Database
functions keep accepting the arguments older code sends, so the running site
keeps working in between.

### Stripe (optional)

Without `STRIPE_SECRET_KEY` the app runs fine and checkout returns a clear
"not configured" message instead of failing obscurely. With it:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

and put the printed signing secret in `STRIPE_WEBHOOK_SECRET`.

In production, point a webhook endpoint at `/api/webhooks/stripe` with these
events — the last three are what put reserved stock back on sale:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run verify` | All of the above, in the order CI runs them |
| `npm run embed:catalogue` | Embed new or changed products for semantic search |

## Tests

`npm test` covers the parts where a bug would be silent:

- `src/lib/search.test.ts` — stemming, stop words, budget parsing, ranking
  order, and the guarantee that an unmatched query returns nothing.
- `src/lib/hybrid.test.ts` — rank fusion, the similarity cut-offs, and the
  budget applied to semantic matches.
- `src/lib/embeddings.test.ts` — the embedded text, content hashing, and the
  Edge Function client's error handling.
- `src/lib/catalog.test.ts` — category filters: URL round-trip, malformed
  input, sorting and price ranges.
- `src/store/useCartStore.test.ts` — quantity merging, removal at zero,
  totals, and that re-adding an item cannot overwrite its stored price.
- `src/components/product/ProductCard.test.tsx` — rendering, the add-to-cart
  path against the real store, and the missing-image fallback.
- `src/lib/format.test.ts` — currency formatting and rating averages.
- `src/lib/rate-limit.test.ts` — client IP resolution, that limiter keys never
  contain the raw IP, the retry window, and failing open.
- `src/lib/sentry.test.ts` — the scrubber: keys, JWTs, session ids, cookies,
  headers, emails and query strings never reach an error report.
- `src/app/api/checkout/route.test.ts` — also: a flood is stopped before any
  read, reservation or Stripe call, and a fourth open checkout is refused.
- `src/app/api/checkout/cancel/route.test.ts` — Stripe's back link releases
  units only after Stripe has closed the session, never for a paid one.
- `supabase/tests/schema.test.ts` — **the SQL itself, on a real Postgres**:
  PGlite (Postgres in WebAssembly, in-process, no Docker) loads the whole
  `schema.sql` twice and `seed.sql`, with Supabase's roles, default grants and
  RLS stubbed in `supabase/tests/db.ts`. Covers reservations all-or-nothing,
  sizes, idempotent release and paid orders, the open-checkout cap, rate
  limits, and what the public anon key can reach: no server-only function, no
  self-made paid order, nobody else's orders, no forged "verified purchase".

## Known limitations

Listed rather than hidden:

- The admin panel itself is in English. Its product and category forms edit
  the Spanish and Russian names and descriptions (saved in the same
  transaction as the rest); translated specifications are set in the
  database.
- Supabase's own emails (confirmation, password reset) are in English.
- A cart line keeps the title it was added with; switching language does not
  rename lines already in the cart (checkout and Stripe use the new language).
- Semantic search is English-only: gte-small is an English model, so a
  Russian or Spanish query falls back to keyword matching in practice.
- The similarity thresholds were calibrated on a 10-product catalogue; a much
  larger or different catalogue should be re-checked.
- Units in an open checkout are unavailable to others for up to ~36 minutes
  (Stripe's minimum session life plus a margin) if the shopper walks away —
  leaving through Stripe's "back" link releases them at once, the browser's
  back button does not. The per-shopper cap bounds this, but someone with many
  IP addresses could still hold stock.
- "Verified purchase" is decided when a review is written or edited: a review
  written before buying stays unmarked until it is edited.
- Rate limits are per IP for visitors who are not signed in, so people behind
  one address (an office, a carrier's NAT) share them.
- The Content Security Policy allows inline scripts (see Architecture notes);
  it limits where an injected script could send data, not whether it runs.
- The store sends no email of its own. Stripe emails receipts for live-mode
  payments only.
- The SQL tests run on PGlite with Supabase's auth and storage stubbed, and
  one connection, so they cannot show two checkouts racing; the locking that
  handles that is reviewed, not tested.
- No end-to-end browser tests; the Stripe flow is tested with mocked Stripe
  and Supabase clients plus manual test-mode purchases.

## Licence

MIT
