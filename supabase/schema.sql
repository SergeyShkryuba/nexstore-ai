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

-- Таблица профилей
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'user',
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Таблица избранного (Wishlist)
create table wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, product_id)
);

-- Функция автоматического создания профиля при регистрации
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

-- Триггер на создание пользователя
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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

alter table profiles enable row level security;
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);

alter table wishlist enable row level security;
create policy "Users can view their own wishlist" on wishlist for select using (auth.uid() = user_id);
create policy "Users can insert into their own wishlist" on wishlist for insert with check (auth.uid() = user_id);
create policy "Users can delete from their own wishlist" on wishlist for delete using (auth.uid() = user_id);

-- Таблица отзывов
create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now()
);

alter table reviews enable row level security;
-- Отзывы видят все
create policy "Reviews are viewable by everyone" on reviews for select using (true);
-- Оставлять отзывы могут только авторизованные
create policy "Users can insert their own reviews" on reviews for insert with check (auth.uid() = user_id);
