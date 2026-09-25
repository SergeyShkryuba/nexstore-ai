-- ---------------------------------------------------------------------------
-- NexStore AI — database schema
--
-- Idempotent: safe to re-run against an existing project. Apply with
--   supabase db reset            (local)
-- or by pasting into the SQL editor of a hosted project.
-- ---------------------------------------------------------------------------

-- =========================== Tables ========================================

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  title text not null,
  slug text unique not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  inventory_count integer not null default 0 check (inventory_count >= 0),
  image_urls text[] not null default '{}',
  attributes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_attributes on products using gin (attributes);
create index if not exists idx_products_category on products (category_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: guests can check out. Stripe is the source of truth for payment,
  -- and an order without an account is still a real order.
  user_id uuid references auth.users on delete set null,
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  stripe_session_id text unique,
  customer_email text,
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_user on orders (user_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0)
);

create index if not exists idx_order_items_order on order_items (order_id);

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'user' check (role in ('user', 'admin')),
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  -- One review per person per product; editing replaces the old one.
  unique (product_id, user_id)
);

create index if not exists idx_reviews_product on reviews (product_id);

-- Columns added after the first release — kept here so the file stays re-runnable.
alter table orders add column if not exists stripe_session_id text;
alter table orders add column if not exists customer_email text;
alter table orders alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_stripe_session_id_key'
  ) then
    alter table orders add constraint orders_stripe_session_id_key unique (stripe_session_id);
  end if;
end $$;

-- ========================== Functions ======================================

-- Create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep updated_at honest without every caller remembering to set it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger products_touch_updated_at
  before update on products
  for each row execute procedure public.touch_updated_at();

create or replace trigger orders_touch_updated_at
  before update on orders
  for each row execute procedure public.touch_updated_at();

-- Is the caller an admin? Used by the RLS policies below.
-- SECURITY DEFINER so the policy can read `profiles` without recursing into
-- the profiles policies themselves.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Atomic stock decrement, called by the Stripe webhook after payment.
create or replace function public.decrement_inventory(p_product_id uuid, p_quantity integer)
returns void
language sql
security definer
set search_path = public
as $$
  update products
  set inventory_count = greatest(0, inventory_count - p_quantity)
  where id = p_product_id;
$$;

-- Postgres lets PUBLIC execute new functions, and Supabase exposes public-schema
-- functions over its REST API. This one is SECURITY DEFINER, so with the anon
-- key (shipped in every page) anyone could zero the stock of any product.
-- Kept for older deployments of the webhook; record_paid_order() replaces it.
revoke all on function public.decrement_inventory(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_inventory(uuid, integer) to service_role;

-- ===================== Row Level Security ==================================
-- Every table below has RLS enabled. `order_items` in particular was previously
-- left unprotected, which exposed every line item to the anon key.

alter table categories  enable row level security;
alter table products    enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table profiles    enable row level security;
alter table wishlist    enable row level security;
alter table reviews     enable row level security;

-- Catalogue: world-readable, admin-writable.
drop policy if exists "Categories are viewable by everyone" on categories;
create policy "Categories are viewable by everyone"
  on categories for select using (true);

drop policy if exists "Admins manage categories" on categories;
create policy "Admins manage categories"
  on categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Products are viewable by everyone" on products;
create policy "Products are viewable by everyone"
  on products for select using (true);

drop policy if exists "Admins manage products" on products;
create policy "Admins manage products"
  on products for all using (public.is_admin()) with check (public.is_admin());

-- Orders: your own, or everything if you are an admin. Inserts come from the
-- Stripe webhook using the service-role key, which bypasses RLS entirely.
drop policy if exists "Users can view their own orders" on orders;
create policy "Users can view their own orders"
  on orders for select using (auth.uid() = user_id or public.is_admin());

-- No insert policy on purpose. Orders are created only by the Stripe webhook
-- (service role). The policy that used to be here let any signed-in user insert
-- an order for themselves — status 'paid', any total — without paying.
drop policy if exists "Users can insert their own orders" on orders;

drop policy if exists "Order items follow their order" on order_items;
create policy "Order items follow their order"
  on order_items for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- Profiles: the display fields are public (reviews show an author), the row is
-- only writable by its owner.
drop policy if exists "Users can view their own profile" on profiles;
drop policy if exists "Profiles are viewable by everyone" on profiles;
create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- The policy above limits which ROW a user may update, not which COLUMNS, so on
-- its own it let anyone set their own role to 'admin'. Users may change their
-- name and avatar only; roles are granted from the SQL editor.
revoke update on profiles from anon, authenticated;
grant update (full_name, avatar_url) on profiles to authenticated;

-- Wishlist: strictly private.
drop policy if exists "Users can view their own wishlist" on wishlist;
create policy "Users can view their own wishlist"
  on wishlist for select using (auth.uid() = user_id);

drop policy if exists "Users can insert into their own wishlist" on wishlist;
create policy "Users can insert into their own wishlist"
  on wishlist for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete from their own wishlist" on wishlist;
create policy "Users can delete from their own wishlist"
  on wishlist for delete using (auth.uid() = user_id);

-- Reviews: readable by all, writable only by their author.
drop policy if exists "Reviews are viewable by everyone" on reviews;
create policy "Reviews are viewable by everyone"
  on reviews for select using (true);

drop policy if exists "Users can insert their own reviews" on reviews;
create policy "Users can insert their own reviews"
  on reviews for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own reviews" on reviews;
create policy "Users can update their own reviews"
  on reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Same row-versus-column gap as profiles: without this a user could move their
-- review onto another product. Only the rating and the text are editable.
revoke update on reviews from anon, authenticated;
grant update (rating, comment) on reviews to authenticated;

drop policy if exists "Users can delete their own reviews" on reviews;
create policy "Users can delete their own reviews"
  on reviews for delete using (auth.uid() = user_id);

-- ======================== Semantic search ==================================
-- Product embeddings (gte-small, 384 dimensions) produced by the `embed` Edge
-- Function. Kept out of `products` so `select('*')` on the catalogue does not
-- ship 384 floats per row to the browser. `content_hash` is the SHA-256 of the
-- text that was embedded, so the backfill script only re-embeds what changed.

create extension if not exists vector with schema extensions;

create table if not exists product_embeddings (
  product_id uuid primary key references products(id) on delete cascade,
  embedding extensions.vector(384) not null,
  content_hash text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_embeddings_hnsw on product_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table product_embeddings enable row level security;

-- No read policy: vectors are only reachable through match_products(), which
-- returns ids and scores. Admins write them from the admin panel; the backfill
-- script uses the service-role key and bypasses RLS.
drop policy if exists "Admins manage product embeddings" on product_embeddings;
create policy "Admins manage product embeddings"
  on product_embeddings for all using (public.is_admin()) with check (public.is_admin());

-- Nearest products by cosine similarity (1 = same direction).
-- SECURITY DEFINER to read the embeddings table past its RLS; it only ever
-- returns product ids and similarity scores.
create or replace function public.match_products(
  query_embedding extensions.vector(384),
  match_count integer default 12
)
returns table (id uuid, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select e.product_id, 1 - (e.embedding <=> query_embedding)
  from product_embeddings e
  order by e.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_products(extensions.vector, integer) from public;
grant execute on function public.match_products(extensions.vector, integer) to anon, authenticated, service_role;

-- ========================== Admin panel ====================================
-- Admins move orders through their statuses. Without this policy an UPDATE
-- from the admin panel silently matches zero rows.
drop policy if exists "Admins update orders" on orders;
create policy "Admins update orders"
  on orders for update using (public.is_admin()) with check (public.is_admin());

-- Product photos uploaded from the admin panel. Public bucket: the storefront
-- and next/image read files by URL without a session. Only admins may write,
-- and only images of at most 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ===================== Product variants (sizes) ============================
-- A product sold in sizes has one row per size here, each with its own stock.
-- products.inventory_count stays the total across sizes (kept by a trigger),
-- so cards, the in-stock filter and the admin list read it unchanged.
-- A product with no rows here is sold without a size, as before.

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text not null check (char_length(size) between 1 and 20),
  inventory_count integer not null default 0 check (inventory_count >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, size)
);

create index if not exists idx_product_variants_product on product_variants (product_id);

alter table product_variants enable row level security;

drop policy if exists "Variants are viewable by everyone" on product_variants;
create policy "Variants are viewable by everyone"
  on product_variants for select using (true);

drop policy if exists "Admins manage variants" on product_variants;
create policy "Admins manage variants"
  on product_variants for all using (public.is_admin()) with check (public.is_admin());

-- The size bought, kept on the order line: variant_id links to the size
-- while it exists; variant_label keeps "M" even after the size is removed.
alter table order_items add column if not exists variant_id uuid references product_variants(id) on delete set null;
alter table order_items add column if not exists variant_label text;

-- products.inventory_count = sum of its sizes' stock, whenever a size changes.
create or replace function public.sync_product_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid := coalesce(new.product_id, old.product_id);
begin
  update products
  set inventory_count = coalesce(
    (select sum(inventory_count) from product_variants where product_id = v_product_id), 0)
  where id = v_product_id;
  return null;
end;
$$;

drop trigger if exists product_variants_sync_stock on product_variants;
create trigger product_variants_sync_stock
  after insert or delete or update of inventory_count on product_variants
  for each row execute function public.sync_product_stock();

-- Replaces a product's sizes with the given list, in order, in one
-- transaction. Sizes are matched by name: a listed size keeps its row (and
-- its id on past orders), an unlisted one is removed. Runs as the caller, so
-- RLS applies; the explicit check turns a non-admin call into a clear error.
create or replace function public.set_product_variants(p_product_id uuid, p_variants jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_variant jsonb;
  v_position integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  delete from product_variants
  where product_id = p_product_id
    and size not in (
      select value ->> 'size' from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb))
    );

  for v_variant in select value from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) loop
    insert into product_variants (product_id, size, inventory_count, sort_order)
    values (p_product_id, v_variant ->> 'size', (v_variant ->> 'inventory_count')::integer, v_position)
    on conflict (product_id, size) do update
      set inventory_count = excluded.inventory_count,
          sort_order = excluded.sort_order;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.set_product_variants(uuid, jsonb) from public, anon;
grant execute on function public.set_product_variants(uuid, jsonb) to authenticated, service_role;

-- Saves a product and its sizes as one transaction, so a failure can never
-- leave new text with old sizes (or the reverse). p_product_id null creates.
-- p_variants null leaves sizes untouched; an empty array removes them all.
-- Stock: with sizes, the total is the sum of the sizes (trigger); without,
-- it is p_fields.inventory_count. Runs as the caller: RLS applies.
create or replace function public.save_product(p_product_id uuid, p_fields jsonb, p_variants jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_product_id;
  v_images text[] := coalesce(array(select jsonb_array_elements_text(p_fields -> 'image_urls')), '{}');
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if v_id is null then
    insert into products (title, slug, description, price, inventory_count, category_id, image_urls)
    values (
      p_fields ->> 'title', p_fields ->> 'slug', p_fields ->> 'description',
      (p_fields ->> 'price')::numeric, coalesce((p_fields ->> 'inventory_count')::integer, 0),
      (p_fields ->> 'category_id')::uuid, v_images
    )
    returning id into v_id;
  else
    -- The slug is kept on purpose: renaming must not break links.
    update products
    set title = p_fields ->> 'title',
        description = p_fields ->> 'description',
        price = (p_fields ->> 'price')::numeric,
        category_id = (p_fields ->> 'category_id')::uuid,
        image_urls = v_images
    where id = v_id;
    if not found then
      raise exception 'product_not_found';
    end if;
  end if;

  if p_variants is not null then
    perform public.set_product_variants(v_id, p_variants);
  end if;

  if not exists (select 1 from product_variants where product_id = v_id) then
    update products
    set inventory_count = coalesce((p_fields ->> 'inventory_count')::integer, inventory_count)
    where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_product(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(uuid, jsonb, jsonb) to authenticated, service_role;

-- ================= Stock reservations and paid orders ======================
-- Checkout reserves stock before sending the shopper to Stripe, so two people
-- cannot both buy the last unit.
--
--   reserve_stock()           checkout: takes the units off inventory_count, or
--                             fails as a whole if any line is short
--   record_paid_order()       webhook, paid: turns the reservation into a sale
--   release_reservation()     webhook, expired or failed: puts the units back
--   extend_reservation()      webhook, delayed method (SEPA) still pending
--   release_expired_reservations()  safety net for a lost webhook
--
-- inventory_count is therefore stock that can still be sold; units held in
-- open checkouts are already taken out of it. Every function is idempotent:
-- a reservation leaves 'held' exactly once, so a repeated webhook can neither
-- return stock twice nor sell it twice.

create table if not exists stock_reservations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'held' check (status in ('held', 'converted', 'released')),
  -- [{ "product_id": uuid, "quantity": int }]
  items jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stock_reservations_held
  on stock_reservations (expires_at) where status = 'held';

-- Who opened the checkout: an HMAC of the user id or IP (never the raw value),
-- so reserve_stock() can cap how many checkouts one shopper holds open.
alter table stock_reservations add column if not exists owner_key text;

create index if not exists idx_stock_reservations_owner_held
  on stock_reservations (owner_key) where status = 'held';

alter table stock_reservations enable row level security;

-- Written only through the functions below (service role). Admins may read,
-- to see how many units sit in open checkouts.
drop policy if exists "Admins read reservations" on stock_reservations;
create policy "Admins read reservations"
  on stock_reservations for select using (public.is_admin());

-- Puts a held reservation's units back. False if it was not held (already
-- released, converted, or unknown), which makes repeats harmless.
create or replace function public.release_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_item jsonb;
begin
  update stock_reservations
  set status = 'released', updated_at = now()
  where id = p_reservation_id and status = 'held'
  returning items into v_items;

  if v_items is null then
    return false;
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    if nullif(v_item ->> 'variant_id', '') is not null then
      -- The size's stock; the trigger updates the product's total.
      update product_variants
      set inventory_count = inventory_count + (v_item ->> 'quantity')::integer
      where id = (v_item ->> 'variant_id')::uuid;
    else
      -- A product sold in sizes gets its total only from its sizes (trigger);
      -- a line without a size (from before sizes existed) must not touch it.
      update products
      set inventory_count = inventory_count + (v_item ->> 'quantity')::integer
      where id = (v_item ->> 'product_id')::uuid
        and not exists (select 1 from product_variants where product_id = (v_item ->> 'product_id')::uuid);
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from stock_reservations
    where status = 'held' and expires_at < now()
    for update skip locked
  loop
    if public.release_reservation(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- All lines or none. The conditional UPDATE locks each product (or size) row,
-- so concurrent checkouts for the same item queue up instead of overselling.
-- Lines are taken in a fixed order (product, then size) so two carts holding
-- the same items can never lock them in opposite orders and deadlock.
-- Raises 'insufficient_stock', or 'variant_required' for a product sold in
-- sizes when no size was given, with the product id in the detail.
--
-- With p_owner_key and p_max_held, raises 'too_many_reservations' when that
-- owner already holds p_max_held open checkouts — otherwise one visitor could
-- take the whole shelf off sale for half an hour at a time. A per-owner
-- advisory lock makes the count and the insert one step, so parallel requests
-- cannot all slip under the cap. Both default to null, so a caller that still
-- passes only (p_items, p_ttl_seconds) keeps working while code and database
-- are updated at different moments.
drop function if exists public.reserve_stock(jsonb, integer);

create or replace function public.reserve_stock(
  p_items jsonb,
  p_ttl_seconds integer,
  p_owner_key text default null,
  p_max_held integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_reservation_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_reservation';
  end if;

  -- Stock stuck in abandoned checkouts comes back before we count it.
  perform public.release_expired_reservations();

  -- Taken before any product row, always in that order, so it cannot deadlock
  -- with the row locks below.
  if p_owner_key is not null and p_max_held is not null then
    perform pg_advisory_xact_lock(hashtext('reserve_stock:' || p_owner_key));
    if (
      select count(*) from stock_reservations
      where owner_key = p_owner_key and status = 'held' and expires_at > now()
    ) >= p_max_held then
      raise exception 'too_many_reservations';
    end if;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value ->> 'product_id', coalesce(value ->> 'variant_id', '')
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then
      raise exception 'invalid_quantity';
    end if;

    if v_variant_id is not null then
      -- The size must belong to this product; the trigger updates the total.
      update product_variants
      set inventory_count = inventory_count - v_quantity
      where id = v_variant_id and product_id = v_product_id and inventory_count >= v_quantity;
    else
      if exists (select 1 from product_variants where product_id = v_product_id) then
        raise exception 'variant_required' using detail = v_product_id::text;
      end if;
      update products
      set inventory_count = inventory_count - v_quantity
      where id = v_product_id and inventory_count >= v_quantity;
    end if;

    if not found then
      raise exception 'insufficient_stock' using detail = v_product_id::text;
    end if;
  end loop;

  insert into stock_reservations (items, expires_at, owner_key)
  values (p_items, now() + make_interval(secs => greatest(p_ttl_seconds, 60)), p_owner_key)
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

-- Keeps the units held while a delayed payment method (SEPA debit) settles.
create or replace function public.extend_reservation(p_reservation_id uuid, p_until timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update stock_reservations
  set expires_at = greatest(expires_at, p_until), updated_at = now()
  where id = p_reservation_id and status = 'held';
  return found;
end;
$$;

-- Records a paid Checkout Session as one transaction: the order, its lines and
-- the stock all change together, or nothing does. Idempotent: a repeat
-- delivery hits the unique stripe_session_id, changes nothing, returns null.
--
-- Stock: a held reservation becomes the sale (its units were already taken).
-- Without one (an older checkout, or a reservation released before the
-- payment landed) the units are taken now instead.
-- A buyer or product deleted since checkout is stored as null rather than
-- failing the insert, which Stripe would otherwise retry for days.
drop function if exists public.record_paid_order(text, uuid, text, numeric, jsonb, jsonb);

create or replace function public.record_paid_order(
  p_session_id text,
  p_user_id uuid,
  p_email text,
  p_total numeric,
  p_shipping jsonb,
  p_items jsonb,
  p_reservation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_reserved boolean := false;
begin
  insert into orders (user_id, total_amount, status, stripe_session_id, customer_email, shipping_address)
  values (
    (select id from auth.users where id = p_user_id),
    p_total, 'paid', p_session_id, p_email, p_shipping
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    return null;  -- already recorded by an earlier delivery
  end if;

  if p_reservation_id is not null then
    update stock_reservations
    set status = 'converted', updated_at = now()
    where id = p_reservation_id and status = 'held';
    v_reserved := found;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_product_id := (select id from products where id = (v_item ->> 'product_id')::uuid);
    v_variant_id := (
      select id from product_variants
      where id = nullif(v_item ->> 'variant_id', '')::uuid and product_id = v_product_id
    );
    v_quantity := (v_item ->> 'quantity')::integer;

    insert into order_items (order_id, product_id, variant_id, variant_label, quantity, unit_price)
    values (
      v_order_id, v_product_id, v_variant_id, nullif(v_item ->> 'variant_label', ''),
      v_quantity, (v_item ->> 'unit_price')::numeric
    );

    if v_product_id is not null and not v_reserved then
      if v_variant_id is not null then
        update product_variants
        set inventory_count = greatest(0, inventory_count - v_quantity)
        where id = v_variant_id;
      else
        -- Same rule as release_reservation: never write the total of a sized
        -- product directly.
        update products
        set inventory_count = greatest(0, inventory_count - v_quantity)
        where id = v_product_id
          and not exists (select 1 from product_variants where product_id = v_product_id);
      end if;
    end if;
  end loop;

  return v_order_id;
end;
$$;

-- Only the server (service role) may reserve, release or record payments.
revoke all on function public.reserve_stock(jsonb, integer, text, integer) from public, anon, authenticated;
revoke all on function public.release_reservation(uuid) from public, anon, authenticated;
revoke all on function public.release_expired_reservations() from public, anon, authenticated;
revoke all on function public.extend_reservation(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.record_paid_order(text, uuid, text, numeric, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reserve_stock(jsonb, integer, text, integer) to service_role;
grant execute on function public.release_reservation(uuid) to service_role;
grant execute on function public.release_expired_reservations() to service_role;
grant execute on function public.extend_reservation(uuid, timestamptz) to service_role;
grant execute on function public.record_paid_order(text, uuid, text, numeric, jsonb, jsonb, uuid) to service_role;

-- ================= Rate limiting ============================================
-- Fixed-window request counters for the routes that cost something: checkout
-- (reserves stock, opens a Stripe session) and search (calls the embedding
-- Edge Function). Keys are HMACs computed by the app, so no IP address or user
-- id is stored. Serverless instances share nothing in memory; Postgres is the
-- one place every instance sees.

create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- No policies: only the service role (which bypasses RLS) touches it.
alter table rate_limits enable row level security;

-- Counts one hit and says whether it is within the limit. The upsert is a
-- single atomic statement, so parallel requests cannot both read "limit - 1".
-- A fixed window allows up to twice the limit across a window boundary; that
-- is accepted for a limit whose job is to stop floods, not to meter.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- Old windows are useless; the daily cron clears them.
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.purge_rate_limits() to service_role;
