# NexStore

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

- **Search** — field-weighted keyword ranking with suggestions as you type and
  budgets in three languages (`"smart home under 60"`, `"до 60"`) applied as a
  price filter; `"kitchen knife"` returns nothing, because the shop sells none.
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
- **Shop assistant, on the site and in Telegram** — works in two modes from
  the same tools. *Button mode* (no key, no running cost): menu buttons for
  finding a product, the shopper's orders, delivery and returns, and contacting
  the team, with anything typed treated as a catalogue search. *AI mode* (set
  `ANTHROPIC_API_KEY`): typed text is understood by Claude (Haiku 4.5), which
  calls the same tools. On the site, results show as product and order cards;
  in Telegram, as a list with link buttons, plus a catalogue by category and an
  order's status by number and email.
- **Contact page** — a form in three languages that files the same support
  requests as the assistant's "talk to a person", so shoppers can reach the
  team with or without the assistant.
- **Owner alerts** — every new order (with anything it left running low) and
  every "talk to a person" request reaches the owner on Telegram and/or
  WhatsApp, sent after the response so a slow messenger never holds up Stripe
  or the shopper, and once per order even when Stripe redelivers the event.
- **Admin panel** — a dashboard (revenue, paid orders and average order against
  the previous period, revenue per day, top products, orders by status, low
  stock, open support requests; 7/30/90 days) and product creation, gated on `profiles.role`
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

**Search** (`src/lib/search.ts`, `src/lib/search-service.ts`) is keyword
ranking: field-weighted term matching with stemming, saturating counts, a
coverage multiplier, an exact-phrase bonus and a lift for products in a
category the query names. A budget phrase is parsed out and applied as a price
filter rather than matched as words. The ranker is a pure module, unit-tested
without a database; the search box and the shop assistant share it.

An earlier version also ranked by meaning (gte-small embeddings in pgvector,
fused with the keyword ranker). It was removed: for a catalogue like this one,
names, types and budgets are what shoppers type, and the embeddings added an
Edge Function, a vector index and a re-embedding step on every product edit.
`schema.sql` drops what it left behind.

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
  ("under 60", "menos de 60", "до 60").
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

### Shop assistant (optional)

Set `ANTHROPIC_API_KEY` (console.anthropic.com → API keys) and redeploy: the
widget is built into the pages, and without the key it is not rendered and
`/api/chat` answers 503. Run the "Support requests" block of `schema.sql`
before deploying, or the admin panel's Support page cannot load. Each message
is rate-limited per visitor (20 per 10 minutes, 150 per day); a spend limit in
the Anthropic console is still worth setting.

### Telegram bot (optional)

The bot that sends owner alerts also serves shoppers. Set
`TELEGRAM_WEBHOOK_SECRET` (any long random string) next to `TELEGRAM_BOT_TOKEN`,
deploy, then point the bot at the site:

```bash
npm run telegram -- webhook https://your.site   # once per site address
npm run telegram -- info                         # where updates go, last error
npm run telegram -- poll                         # local development, no webhook
```

The bot keeps no conversation state: questions that need an answer (an order
number and email, a message to the team) are sent as force-replies and
recognised by the question they answer. Order lookups need both the number and
the email the order was paid with, and are rate-limited per chat.

### Owner alerts (optional)

Each messenger is used when its variables are set and skipped otherwise.

- **Telegram:** create a bot with @BotFather, press Start in it, and set
  `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (your chat's id, from
  `https://api.telegram.org/bot<token>/getUpdates`).
- **WhatsApp (Cloud API):** set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
  and `WHATSAPP_OWNER_NUMBER` (digits, with the country code). A business can
  only start a conversation with an approved template: create `store_alert`
  (Utility, English) with the body
  `NexStore: {{1}}. {{2}} Details in the admin panel.`

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
- `src/lib/analytics.test.ts` — what counts as revenue (paid, shipped,
  delivered; never pending, cancelled or refunded), days with no sales, the
  period comparison, top products and the low-stock list.
- `src/lib/chat/*.test.ts` — the assistant's tool loop against a scripted
  model (all of a turn's tool results in one message, a failing tool, a call
  cut off at `max_tokens`, the step cap), its tools (budget, sizes in stock,
  only the shopper's own orders even for an admin), the request limits and
  the streamed event format.
- `src/app/api/chat/route.test.ts` / `src/app/api/support/route.test.ts` —
  both rate limits counted, errors in the shopper's language, and no model or
  database error text passed to the browser.
- `src/lib/telegram/bot.test.ts` and `src/lib/chat/menu.test.ts` — button
  mode on both channels: the menu in the user's language, search with budgets,
  the catalogue by category, order status only for a matching number and email
  and within the limit, a message to the team only with an email, and the AI
  taking over typed text when it is configured.
- `src/lib/notify/notify.test.ts` — alert wording (HTML escaped for Telegram,
  single-line values for WhatsApp templates), one channel failing without the
  other, no token in any log line, and the low-stock check; the Stripe webhook
  test checks an order is announced once and never on a redelivery.
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
- The shop assistant sees the last 12 messages of a chat and forgets product
  details between turns beyond the names of the cards it showed; the chat
  lives in the tab (`sessionStorage`).
- Search matches words, not meaning: "something to keep me warm" finds only
  products whose text says "warm". Russian has no morphology beyond simple
  prefix matching ("умный дом" does not find "Умная лампа").
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
