# Handover: running this store for a new owner

How to launch the store for a client, hand it over, and what the owner does
afterwards. The README explains how the code works; this file is the checklist.

**One rule above all: every account belongs to the client from day one.** The
client signs up with their own email and company and invites the developer.
Nothing is created on the developer's name "to transfer later", so at the end
there is nothing to transfer, only access to remove.

---

## 1. Accounts the client creates

| Service | What for | Plan for a real shop | Required |
|---|---|---|---|
| Domain registrar | the shop's address | — | yes |
| GitHub (organisation) | the code, **private** repository | Free | yes |
| Vercel (team) | hosting | **Pro**: the free Hobby plan is for non-commercial use only | yes |
| Supabase (organisation) | database, sign-in, photos | **Pro** recommended: Free pauses after a week without traffic and has no backups | yes |
| Stripe | payments | pay-as-you-go; live payments need the business verified | yes |
| Telegram | shop bot and owner alerts | free | recommended |
| Meta Business (WhatsApp Cloud API) | owner alerts on WhatsApp | per-message pricing for templates | optional |
| Anthropic | AI mode for the shop assistant | pay-as-you-go; set a monthly spend limit | optional |
| Sentry | error reports | Free | optional |

Check each provider's current plans and terms before quoting: they change.

## 2. Launch, in this order

### Database (Supabase)
1. Create a project in the region closest to the customers (EU for an EU shop).
2. **SQL Editor**: run `supabase/schema.sql`. It is idempotent: safe to run again
   after every update that changes it.
3. `supabase/seed.sql` is the **demo** catalogue. Skip it for a real shop; the
   owner adds products in the admin panel.
4. **Authentication → Providers → Email**: keep "Confirm email" on.
   **Authentication → URL Configuration**: set the site URL to the shop's domain.

### Hosting (Vercel)
1. Import the GitHub repository.
2. Set the environment variables (section 5) for **Production**.
3. Deploy, then add the domain under **Settings → Domains**.
4. The daily cron (`vercel.json` → `/api/keepalive`) releases stale stock
   holds and deletes old data; set `CRON_SECRET` so nobody else can call it.

### Payments (Stripe)
1. Keys from **Developers → API keys** → `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint**: `https://<domain>/api/webhooks/stripe`
   with the events `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`.
   Its signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Test the whole order flow in **test mode** first (card `4242 4242 4242 4242`),
   then switch to live keys.

### Telegram
1. Create the bot with @BotFather; token → `TELEGRAM_BOT_TOKEN`.
2. The owner presses **Start** in the bot. Their chat id → `TELEGRAM_CHAT_ID`
   (it is the owner's Telegram user id; `https://api.telegram.org/bot<token>/getUpdates`
   shows it after they write to the bot).
3. Any long random string → `TELEGRAM_WEBHOOK_SECRET`. Deploy, then from a checkout
   with `.env.local` filled in:
   ```bash
   npm run telegram -- webhook https://<domain>   # the bot talks to the site
   npm run telegram -- profile                    # name, descriptions, /menu command
   npm run telegram -- info                       # check: address and last error
   ```

### The store's identity
Edit `src/config/store.ts`, or set the variables in Vercel:

- `NEXT_PUBLIC_STORE_NAME`: replaces "NexStore" everywhere, in all three languages.
- `NEXT_PUBLIC_DEMO_MODE=false`: removes every demo and test-payment notice and
  the "About this project" page, and stops the assistant calling orders test orders.
- `NEXT_PUBLIC_STORE_EMAIL`, `NEXT_PUBLIC_TELEGRAM_BOT`, `NEXT_PUBLIC_INSTAGRAM_URL`,
  `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_TIKTOK_URL`: contacts on the contact page
  and in the footer.
- `NEXT_PUBLIC_SOURCE_URL`: leave empty; the repository is private.

Then replace the logo text and colours if the client has a brand (header in
`src/components/layout/Header.tsx`, colours in `src/app/globals.css`).

### Legal texts (not optional)
The terms, privacy and shipping pages (`messages/{en,es,ru}.json` → `Pages`) are
written for the demo. Before going live, have them rewritten for the client:
company name and registration, address, VAT number, real delivery times and
return address, the services in section 1 that are actually used. Shops in
Germany also need an Impressum page. The privacy page lists the data the code
stores; keep it true if features change.

## 3. Make the owner an admin
The owner signs up on the site and confirms their email. Then, in **Supabase → SQL Editor**:
```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'owner@example.com');
```
They sign in again and see "Admin" in the header. To remove someone's access,
set `role = 'user'` the same way. Roles cannot be changed from the site.

## 4. Hand over
1. **Ownership** (only if anything was created on the developer's side):
   GitHub → Settings → Transfer ownership; Vercel → move the project to the
   client's team; Supabase → transfer the project to the client's organisation;
   Telegram → @BotFather → the bot → Transfer Ownership.
2. **Rotate every secret** once the client owns the accounts, and update Vercel:
   Supabase service-role key, Stripe keys and webhook secret, Telegram token and
   webhook secret, `CRON_SECRET`, any API keys. Redeploy.
3. **Secrets travel through a password manager** (Bitwarden Send, 1Password),
   never through chat or email.
4. **Remove developer access**: the developer's admin role on the site, and
   their membership in GitHub, Vercel, Supabase and Stripe. If the developer
   stays on for support, keep the least access that does the job (no billing,
   no delete).
5. **A 20–30 minute walkthrough** for the owner: adding products and photos,
   translations, order statuses, support requests, the dashboard.

### Before calling it done
- [ ] A test order goes through, appears in Admin → Orders and in the owner's Telegram.
- [ ] A message from the contact page appears in Admin → Support and in Telegram.
- [ ] The bot answers `/start` and its links open the shop's domain.
- [ ] No "demo" or "test mode" text anywhere (`NEXT_PUBLIC_DEMO_MODE=false`).
- [ ] Legal pages rewritten with the client's details.
- [ ] Stripe on live keys; one real low-value purchase refunded as a final check.
- [ ] Secrets rotated, developer access removed.

## 5. Environment variables

Secrets are marked; the rest are public by design (`NEXT_PUBLIC_` values reach the browser).

| Variable | Where from | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same (public by design, protected by RLS) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same — **secret** | yes |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys — **secret** | yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe → the webhook endpoint — **secret** | yes |
| `NEXT_PUBLIC_SITE_URL` | `https://<domain>` | yes, once there is a domain |
| `CRON_SECRET` | any long random string — **secret** | recommended |
| `TELEGRAM_BOT_TOKEN` | @BotFather — **secret** | for the bot and alerts |
| `TELEGRAM_CHAT_ID` | the owner's Telegram id | for alerts |
| `TELEGRAM_WEBHOOK_SECRET` | any long random string — **secret** | for the bot |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_OWNER_NUMBER` | Meta → WhatsApp → API setup (token is **secret**) | optional |
| `ANTHROPIC_API_KEY` | console.anthropic.com — **secret** | optional (AI mode) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project settings | optional |
| `NEXT_PUBLIC_STORE_NAME`, `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_STORE_EMAIL`, `NEXT_PUBLIC_TELEGRAM_BOT`, `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_TIKTOK_URL`, `NEXT_PUBLIC_SOURCE_URL` | the store's details (section 2) | optional |

`NEXT_PUBLIC_` values are built into the pages: redeploy after changing one.

## 6. Running the shop

- **Orders**: Admin → Orders. Changing the status shows on the customer's order page.
- **Messages**: Admin → Support; reply by email, then mark resolved. Resolved
  requests are deleted after 180 days.
- **Dashboard**: revenue, orders, top products and low stock for 7/30/90 days.
- **Customers' data**: customers can delete their own account (Account page).
  For any other request (a copy of their data, a correction), the owner answers
  from the admin panel and Supabase.
- **Backups**: Supabase Pro takes daily backups; on Free there are none.
- **Updates**: changes to `supabase/schema.sql` are applied by running the file
  again in the SQL Editor *before* deploying code that needs them, unless the
  change's own notes say otherwise.
