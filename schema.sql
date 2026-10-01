-- Run in Supabase > SQL Editor
create extension if not exists pgcrypto;
create table stores(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null, tagline text default '', logo_url text,
  phone text default '', whatsapp text default '',        -- whatsapp: digits with country code, e.g. 923001234567
  address text default '', opening_hours text default '', delivery_info text default '',
  delivery_charge numeric default 0, about text default '', currency text default 'Rs',
  primary_color text default '#1f7a4d', accent_color text default '#f2a900',
  socials jsonb default '{}'::jsonb);
create table categories(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null, icon text default '🛒', sort int default 0);
create table products(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null, price numeric not null check(price>=0), old_price numeric check(old_price>=0),
  discount_enabled boolean default false, image_url text, available boolean default true,
  created_at timestamptz default now());
create table store_admins(
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  primary key(user_id, store_id));
create index on products(store_id); create index on categories(store_id);

-- Is the logged-in user an admin of this store?
create function is_store_admin(sid uuid) returns boolean language sql security definer stable
set search_path=public as $$ select exists(select 1 from store_admins where user_id=auth.uid() and store_id=sid) $$;

alter table stores enable row level security; alter table categories enable row level security;
alter table products enable row level security; alter table store_admins enable row level security;

-- Public storefront can read; only that store's admins can write.
create policy "read stores" on stores for select using (true);
create policy "admin update store" on stores for update using (is_store_admin(id)) with check (is_store_admin(id));
create policy "read categories" on categories for select using (true);
create policy "admin write categories" on categories for all using (is_store_admin(store_id)) with check (is_store_admin(store_id));
create policy "read products" on products for select using (true);
create policy "admin write products" on products for all using (is_store_admin(store_id)) with check (is_store_admin(store_id));
create policy "see own admin row" on store_admins for select using (user_id=auth.uid());
-- No insert/update/delete policy on stores(insert)/store_admins: only you (SQL editor) create clients.

-- Storage: public bucket, uploads only inside the admin's own store folder (<store_id>/file)
insert into storage.buckets(id,name,public) values('product-images','product-images',true) on conflict do nothing;
create policy "public read images" on storage.objects for select using (bucket_id='product-images');
create policy "admin upload images" on storage.objects for insert to authenticated
  with check (bucket_id='product-images' and is_store_admin(((storage.foldername(name))[1])::uuid));
create policy "admin update images" on storage.objects for update to authenticated
  using (bucket_id='product-images' and is_store_admin(((storage.foldername(name))[1])::uuid));
create policy "admin delete images" on storage.objects for delete to authenticated
  using (bucket_id='product-images' and is_store_admin(((storage.foldername(name))[1])::uuid));

-- Demo store (change/remove per client)
insert into stores(slug,name,tagline,whatsapp,phone,address,opening_hours,delivery_info,delivery_charge,about)
values('freshmart','FreshMart','Daily essentials, delivered to your door','923001234567','0300 1234567',
'Main Bazaar, Your City','Mon–Sun, 8am–10pm','Free delivery above Rs 2,000. Same-day within the city.',150,
'FreshMart is a family-run neighbourhood store. We stock fresh groceries and household items at fair prices.');
