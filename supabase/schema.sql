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

drop policy if exists "Users can insert their own orders" on orders;
create policy "Users can insert their own orders"
  on orders for insert with check (auth.uid() = user_id);

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
