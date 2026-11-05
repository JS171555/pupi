begin;

-- Fase 1: aplicar em um projeto Supabase dedicado ao Pupi.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 160),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{8,25}$'),
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Casa' check (length(label) between 1 and 60),
  recipient text not null check (length(trim(recipient)) between 1 and 160),
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  street text not null check (length(trim(street)) between 1 and 200),
  number text not null check (length(trim(number)) between 1 and 20),
  complement text check (length(complement) <= 160),
  neighborhood text not null check (length(trim(neighborhood)) between 1 and 120),
  city text not null check (length(trim(city)) between 1 and 120),
  state text not null check (state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  country text not null default 'BR' check (country = 'BR'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, user_id)
);
create index addresses_user_idx on public.addresses(user_id);
create unique index addresses_one_default on public.addresses(user_id) where is_default;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (length(slug) <= 160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 3000),
  image_path text unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  sku text not null unique check (length(trim(sku)) between 1 and 80),
  slug text not null unique check (length(slug) <= 200 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 200),
  title text not null default '' check (length(title) <= 200),
  short_description text not null default '' check (length(short_description) <= 500),
  description text not null default '' check (length(description) <= 30000),
  price_cents integer not null check (price_cents > 0),
  sale_price_cents integer check (sale_price_cents > 0 and sale_price_cents < price_cents),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  weight_grams integer check (weight_grams > 0),
  width_mm integer check (width_mm > 0),
  height_mm integer check (height_mm > 0),
  length_mm integer check (length_mm > 0),
  featured boolean not null default false,
  active boolean not null default true,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_catalog_idx on public.products(created_at desc, id) where status = 'published' and active;
create index products_low_stock_idx on public.products(stock_quantity) where stock_quantity <= minimum_stock;
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '' check (length(alt_text) <= 300),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id,sort_order);
create unique index product_images_one_primary on public.product_images(product_id) where is_primary;

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cart_id,product_id)
);
create index cart_items_product_idx on public.cart_items(product_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  status text not null default 'confirmed' check (status in ('confirmed','preparing','shipped','in_transit','out_for_delivery','delivered','cancelled','delivery_failed')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded','cancelled')),
  subtotal_cents bigint not null check (subtotal_cents > 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents bigint generated always as (subtotal_cents + shipping_cents) stored,
  currency text not null default 'BRL' check (currency = 'BRL'),
  address_snapshot jsonb not null check (jsonb_typeof(address_snapshot) = 'object' and address_snapshot ?& array['recipient','postal_code','street','number','neighborhood','city','state','country']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
create index orders_user_created_idx on public.orders(user_id,created_at desc);
create index orders_status_idx on public.orders(status,created_at desc);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null check (length(trim(product_name)) > 0),
  product_sku text not null check (length(trim(product_sku)) > 0),
  quantity integer not null check (quantity between 1 and 999),
  unit_price_cents integer not null check (unit_price_cents > 0),
  line_total_cents bigint generated always as (quantity::bigint * unit_price_cents) stored,
  created_at timestamptz not null default now(),
  unique(order_id,product_id)
);
create index order_items_product_idx on public.order_items(product_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  provider text not null default 'melhor_envio' check (length(trim(provider)) > 0),
  external_id text,
  carrier text,
  service_name text,
  tracking_code text,
  status text not null default 'pending' check (status in ('pending','posted','in_transit','out_for_delivery','delivered','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_id)
);
create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  provider_event_id text not null check (length(trim(provider_event_id)) > 0),
  status text not null check (status in ('pending','posted','in_transit','out_for_delivery','delivered','failed','cancelled')),
  description text not null check (length(description) <= 1000),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(shipment_id,provider_event_id)
);
create index shipment_events_timeline_idx on public.shipment_events(shipment_id,occurred_at desc);
create table public.store_settings (
  key text primary key check (key in ('store_name','contact_email','origin_postal_code','low_stock_threshold')),
  value jsonb not null check (jsonb_typeof(value) in ('string','number')),
  updated_at timestamptz not null default now()
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (length(trim(reason)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index stock_movements_product_created_idx on public.stock_movements(product_id,created_at desc);
create index stock_movements_actor_idx on public.stock_movements(actor_id);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  -- Apenas chaves e ação: sem endereços, tokens ou dados pessoais duplicados.
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs(actor_id);
create index audit_logs_record_idx on public.audit_logs(table_name,record_id,created_at desc);

-- Todo objeto nasce fechado; as permissões são concedidas na migration RLS.
do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','addresses','categories','products','product_images','carts','cart_items','orders','order_items','shipments','shipment_events','store_settings','stock_movements','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.orders_order_number_seq to service_role;


create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.touch_updated_at() from public;
do $$ declare t text; begin
  foreach t in array array['profiles','addresses','categories','products','carts','cart_items','orders','shipments','store_settings'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  end loop;
end $$;

-- Consulta exclusivamente a função do usuário autenticado, sem confiar no JWT metadata.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- Trigger interno de Auth: aceita apenas nome de exibição, nunca a função solicitada.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name)
    values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),160));
  insert into public.user_roles(user_id,role) values(new.id,'customer');
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;
create trigger pupi_create_profile after insert on auth.users
  for each row execute function private.handle_new_user();
insert into public.profiles(id,full_name)
  select id,left(coalesce(raw_user_meta_data->>'full_name',''),160) from auth.users
  on conflict(id) do nothing;
insert into public.user_roles(user_id)
  select id from public.profiles on conflict(user_id) do nothing;

create function private.record_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(actor_id,table_name,record_id,action)
    values(auth.uid(),tg_table_name,coalesce(row_data->>'id',row_data->>'user_id',row_data->>'key'),tg_op);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.record_audit() from public, anon, authenticated, service_role;
do $$ declare t text; begin
  foreach t in array array['user_roles','categories','products','product_images','orders','shipments','store_settings'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.record_audit()',t);
  end loop;
end $$;

create function private.record_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare change integer;
begin
  change := new.stock_quantity - case when tg_op = 'INSERT' then 0 else old.stock_quantity end;
  if change <> 0 then
    insert into public.stock_movements(product_id,actor_id,delta,balance_after,reason)
    values(new.id,auth.uid(),change,new.stock_quantity,
      coalesce(nullif(current_setting('pupi.stock_reason',true),''),'backend_update'));
  end if;
  return new;
end $$;
revoke all on function private.record_stock() from public, anon, authenticated, service_role;
create trigger record_stock after insert or update of stock_quantity on public.products
  for each row execute function private.record_stock();

create function private.adjust_stock(p_product_id uuid,p_delta integer,p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare balance integer; old_reason text;
begin
  if not private.is_admin() then raise insufficient_privilege using message = 'Admin required'; end if;
  if p_delta is null or p_delta = 0 or p_reason is null or length(trim(p_reason)) not between 1 and 300 then
    raise invalid_parameter_value using message = 'Invalid stock adjustment';
  end if;
  old_reason := current_setting('pupi.stock_reason',true);
  perform set_config('pupi.stock_reason',trim(p_reason),true);
  -- UPDATE bloqueia a linha; CHECK stock_quantity >= 0 também vale sob concorrência.
  update public.products set stock_quantity = stock_quantity + p_delta where id = p_product_id
    returning stock_quantity into balance;
  if not found then raise no_data_found using message = 'Product not found'; end if;
  perform set_config('pupi.stock_reason',coalesce(old_reason,''),true);
  return balance;
end $$;
revoke all on function private.adjust_stock(uuid,integer,text) from public, anon, authenticated;
grant execute on function private.adjust_stock(uuid,integer,text) to authenticated;

-- Wrapper sem elevação: único endpoint de estoque disponível ao app administrativo.
create function public.adjust_stock(p_product_id uuid,p_delta integer,p_reason text) returns integer
language sql security invoker set search_path = '' as $$
  select private.adjust_stock(p_product_id,p_delta,p_reason);
$$;
revoke all on function public.adjust_stock(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.adjust_stock(uuid,integer,text) to authenticated;

create function private.check_order_totals() returns trigger
language plpgsql set search_path = '' as $$
declare order_id_to_check uuid; actual bigint; expected bigint; n bigint;
begin
  if tg_table_name = 'orders' then
    order_id_to_check := new.id;
  else
    order_id_to_check := new.order_id;
  end if;
  select subtotal_cents into expected from public.orders where id = order_id_to_check;
  select coalesce(sum(line_total_cents),0),count(*) into actual,n
    from public.order_items where order_id = order_id_to_check;
  if expected is null or n = 0 or expected <> actual then
    raise check_violation using message = 'Order subtotal must equal its nonempty items';
  end if;
  return null;
end $$;
revoke all on function private.check_order_totals() from public;
create constraint trigger order_total_consistent after insert or update on public.orders
  deferrable initially deferred for each row execute function private.check_order_totals();
create constraint trigger order_items_consistent after insert on public.order_items
  deferrable initially deferred for each row execute function private.check_order_totals();

create function private.protect_order_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'order_items' then
    raise check_violation using message = 'Order items are immutable';
  end if;
  if (new.id,new.order_number,new.user_id,new.idempotency_key,new.request_fingerprint,
      new.subtotal_cents,new.shipping_cents,new.currency,new.address_snapshot,new.created_at)
    is distinct from
     (old.id,old.order_number,old.user_id,old.idempotency_key,old.request_fingerprint,
      old.subtotal_cents,old.shipping_cents,old.currency,old.address_snapshot,old.created_at) then
    raise check_violation using message = 'Order history is immutable';
  end if;
  if new.status <> old.status and not (
    (old.status = 'confirmed' and new.status in ('preparing','cancelled')) or
    (old.status = 'preparing' and new.status in ('shipped','cancelled')) or
    (old.status = 'shipped' and new.status in ('in_transit','delivery_failed')) or
    (old.status = 'in_transit' and new.status in ('out_for_delivery','delivered','delivery_failed')) or
    (old.status = 'out_for_delivery' and new.status in ('delivered','delivery_failed')) or
    (old.status = 'delivery_failed' and new.status in ('in_transit','out_for_delivery','cancelled'))
  ) then raise check_violation using message = 'Invalid order status transition'; end if;
  return new;
end $$;
revoke all on function private.protect_order_history() from public;
create trigger protect_order_history before update on public.orders
  for each row execute function private.protect_order_history();
create trigger protect_order_items before update or delete on public.order_items
  for each row execute function private.protect_order_history();

-- Primitiva de banco para o futuro checkout. Só backend confiável pode executar.
-- p_shipping_cents deve vir de cotação validada no backend, jamais do navegador.
create function private.create_order(
  p_user_id uuid,p_address_id uuid,p_items jsonb,p_shipping_cents integer,p_idempotency_key uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  normalized jsonb; fingerprint text; existing public.orders%rowtype;
  address_data jsonb; product public.products%rowtype; item record;
  order_id_new uuid := gen_random_uuid(); subtotal bigint := 0; price integer;
  old_reason text;
begin
  if p_user_id is null or p_address_id is null or p_idempotency_key is null
    or p_shipping_cents is null or p_shipping_cents < 0
    or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise invalid_parameter_value using message = 'Invalid order request';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise invalid_parameter_value using message = 'Invalid item count';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(product_id uuid,quantity integer)
    where product_id is null or quantity is null or quantity not between 1 and 999)
    or (select count(distinct i.product_id) from jsonb_to_recordset(p_items) as i(product_id uuid)) <> jsonb_array_length(p_items)
  then raise invalid_parameter_value using message = 'Invalid or duplicate items'; end if;
  select jsonb_agg(jsonb_build_object('product_id',i.product_id,'quantity',i.quantity) order by i.product_id)
    into normalized from jsonb_to_recordset(p_items) as i(product_id uuid,quantity integer);
  fingerprint := md5(jsonb_build_object('items',normalized,'address',p_address_id,'shipping',p_shipping_cents)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_idempotency_key::text,0));
  select * into existing from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise invalid_parameter_value using message = 'Idempotency key reused with different request';
    end if;
    return existing.id;
  end if;
  select jsonb_build_object('recipient',a.recipient,'postal_code',a.postal_code,'street',a.street,
    'number',a.number,'complement',a.complement,'neighborhood',a.neighborhood,'city',a.city,'state',a.state,'country',a.country)
    into address_data from public.addresses a where a.id = p_address_id and a.user_id = p_user_id for share;
  if not found then raise invalid_parameter_value using message = 'Address not owned by customer'; end if;
  -- Locks em ordem estável evitam overselling e ciclos entre pedidos concorrentes.
  perform p.id from public.products p
    join jsonb_to_recordset(normalized) as i(product_id uuid) on i.product_id = p.id
    order by p.id for update of p;
  for item in select * from jsonb_to_recordset(normalized) as i(product_id uuid,quantity integer) loop
    select * into product from public.products where id = item.product_id;
    if not found or product.status <> 'published' or not product.active
      or not exists(select 1 from public.categories where id = product.category_id and active)
      or product.stock_quantity < item.quantity then
      raise check_violation using message = 'Product unavailable or insufficient stock';
    end if;
    price := coalesce(product.sale_price_cents,product.price_cents);
    subtotal := subtotal + item.quantity::bigint * price;
  end loop;
  insert into public.orders(id,user_id,idempotency_key,request_fingerprint,subtotal_cents,shipping_cents,address_snapshot)
    values(order_id_new,p_user_id,p_idempotency_key,fingerprint,subtotal,p_shipping_cents,address_data);
  old_reason := current_setting('pupi.stock_reason',true);
  perform set_config('pupi.stock_reason','order:' || order_id_new::text,true);
  for item in select * from jsonb_to_recordset(normalized) as i(product_id uuid,quantity integer) loop
    select * into product from public.products where id = item.product_id;
    insert into public.order_items(order_id,product_id,product_name,product_sku,quantity,unit_price_cents)
      values(order_id_new,product.id,product.name,product.sku,item.quantity,coalesce(product.sale_price_cents,product.price_cents));
    update public.products set stock_quantity = stock_quantity - item.quantity where id = product.id;
  end loop;
  perform set_config('pupi.stock_reason',coalesce(old_reason,''),true);
  return order_id_new;
end $$;
revoke all on function private.create_order(uuid,uuid,jsonb,integer,uuid) from public, anon, authenticated;
grant execute on function private.create_order(uuid,uuid,jsonb,integer,uuid) to service_role;


grant usage on schema public to anon, authenticated;

grant select on public.categories,public.products,public.product_images to anon,authenticated;
create policy categories_visible on public.categories for select to anon,authenticated using (active);
create policy products_visible on public.products for select to anon,authenticated using (
  active and status = 'published' and exists(select 1 from public.categories c where c.id = category_id and c.active)
);
create policy images_visible on public.product_images for select to anon,authenticated using (
  exists(select 1 from public.products p where p.id = product_id and p.active and p.status = 'published'
    and exists(select 1 from public.categories c where c.id = p.category_id and c.active))
);
do $$ declare t text; begin
  foreach t in array array['categories','products','product_images'] loop
    execute format('create policy admin_select on public.%I for select to authenticated using ((select private.is_admin()))',t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select private.is_admin()))',t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select private.is_admin()))',t);
    execute format('grant delete on public.%I to authenticated',t);
  end loop;
end $$;
grant insert(name,slug,description,image_path,sort_order,active),
  update(name,slug,description,image_path,sort_order,active) on public.categories to authenticated;
grant insert(category_id,sku,slug,name,title,short_description,description,price_cents,sale_price_cents,
  minimum_stock,weight_grams,width_mm,height_mm,length_mm,featured,active,status),
  update(category_id,sku,slug,name,title,short_description,description,price_cents,sale_price_cents,
  minimum_stock,weight_grams,width_mm,height_mm,length_mm,featured,active,status) on public.products to authenticated;
grant insert(product_id,storage_path,alt_text,sort_order,is_primary),
  update(storage_path,alt_text,sort_order,is_primary) on public.product_images to authenticated;

grant select on public.profiles,public.user_roles,public.addresses,public.carts,public.cart_items to authenticated;
grant update(full_name,phone) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

grant insert(user_id,label,recipient,postal_code,street,number,complement,neighborhood,city,state,country,is_default),
  update(label,recipient,postal_code,street,number,complement,neighborhood,city,state,country,is_default),
  delete on public.addresses to authenticated;
create policy addresses_read on public.addresses for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy addresses_insert on public.addresses for insert to authenticated with check (user_id = (select auth.uid()));
create policy addresses_update on public.addresses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_delete on public.addresses for delete to authenticated using (user_id = (select auth.uid()));

grant insert(user_id),delete on public.carts to authenticated;
create policy carts_owner on public.carts for select to authenticated using (user_id = (select auth.uid()));
create policy carts_insert on public.carts for insert to authenticated with check (user_id = (select auth.uid()));
create policy carts_delete on public.carts for delete to authenticated using (user_id = (select auth.uid()));
grant insert(cart_id,product_id,quantity),update(quantity),delete on public.cart_items to authenticated;
create policy cart_items_read on public.cart_items for select to authenticated
  using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy cart_items_insert on public.cart_items for insert to authenticated with check (
  exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
  and exists(select 1 from public.products p where p.id = product_id and p.active and p.status = 'published')
);
create policy cart_items_update on public.cart_items for update to authenticated
  using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())))
  with check (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy cart_items_delete on public.cart_items for delete to authenticated
  using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

grant select(id,order_number,user_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,currency,address_snapshot,created_at,updated_at)
  on public.orders to authenticated;
grant select on public.order_items,public.shipments,public.shipment_events to authenticated;
create policy orders_read on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy order_items_read on public.order_items for select to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id
    and (o.user_id = (select auth.uid()) or (select private.is_admin())))
);
create policy shipments_read on public.shipments for select to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id
    and (o.user_id = (select auth.uid()) or (select private.is_admin())))
);
create policy shipment_events_read on public.shipment_events for select to authenticated using (
  exists(select 1 from public.shipments s join public.orders o on o.id = s.order_id
    where s.id = shipment_id and (o.user_id = (select auth.uid()) or (select private.is_admin())))
);

grant select on public.store_settings,public.stock_movements,public.audit_logs to authenticated;
create policy settings_admin on public.store_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant insert(key,value),update(value),delete on public.store_settings to authenticated;
create policy stock_read_admin on public.stock_movements for select to authenticated using ((select private.is_admin()));
create policy audit_read_admin on public.audit_logs for select to authenticated using ((select private.is_admin()));

-- Novos objetos privados permanecem fechados por padrão.
alter default privileges in schema private revoke execute on functions from public;


alter table public.categories add constraint category_image_path_valid check (
  image_path is null or image_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
);
alter table public.product_images add constraint product_image_path_valid check (
  storage_path ~ ('^' || product_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('product-images','product-images',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('category-images','category-images',false,5242880,array['image/jpeg','image/png','image/webp']);

-- O schema storage é gerenciado pelo Supabase. Não alterar sua estrutura.
create policy pupi_product_image_read on storage.objects for select to anon,authenticated using (
  bucket_id = 'product-images' and exists(
    select 1 from public.product_images i join public.products p on p.id = i.product_id
    join public.categories c on c.id = p.category_id
    where i.storage_path = storage.objects.name and p.active and p.status = 'published' and c.active
  )
);
create policy pupi_category_image_read on storage.objects for select to anon,authenticated using (
  bucket_id = 'category-images' and exists(
    select 1 from public.categories c where c.image_path = storage.objects.name and c.active
  )
);
create policy pupi_media_admin_read on storage.objects for select to authenticated using (
  bucket_id in ('product-images','category-images') and (select private.is_admin())
);
create policy pupi_media_admin_insert on storage.objects for insert to authenticated with check (
  (select private.is_admin()) and (
    (bucket_id = 'product-images' and exists(select 1 from public.products p
      where storage.objects.name ~ ('^' || p.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))) or
    (bucket_id = 'category-images' and exists(select 1 from public.categories c
      where storage.objects.name ~ ('^' || c.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')))
  )
);
-- Arquivos são imutáveis: enviar novo caminho, atualizar vínculo e remover antigo.
-- Não conceder UPDATE evita substituição de conteúdo sob URLs assinadas existentes.
create policy pupi_media_admin_delete on storage.objects for delete to authenticated using (
  bucket_id in ('product-images','category-images') and (select private.is_admin())
);

commit;
