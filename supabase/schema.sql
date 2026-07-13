-- Схема базы данных для NexStore AI

-- Таблица категорий
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  created_at timestamptz default now()
);

-- Таблица товаров
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id),
  title text not null,
  slug text unique not null,
  description text,
  price numeric(10, 2) not null,
  inventory_count integer not null default 0,
  image_urls text[], -- массив ссылок на картинки
  attributes jsonb, -- гибкие атрибуты: цвет, размер, диагональ экрана и т.д.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Индекс для JSONB поля (для быстрого поиска ИИ)
create index idx_products_attributes on products using gin (attributes);

-- Таблица заказов (для чекаута)
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  total_amount numeric(10, 2) not null,
  status text not null default 'pending', -- pending, paid, shipped, delivered, cancelled
  shipping_address jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Таблица позиций заказа
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id),
  quantity integer not null,
  unit_price numeric(10, 2) not null
);

-- Row Level Security (RLS)
alter table products enable row level security;
-- Товары видят все
create policy "Products are viewable by everyone" on products for select using (true);

alter table categories enable row level security;
create policy "Categories are viewable by everyone" on categories for select using (true);

alter table orders enable row level security;
-- Пользователь видит только свои заказы
create policy "Users can view their own orders" on orders for select using (auth.uid() = user_id);
create policy "Users can insert their own orders" on orders for insert with check (auth.uid() = user_id);
