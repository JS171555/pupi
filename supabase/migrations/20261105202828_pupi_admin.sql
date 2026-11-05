begin;
create table private.admin_requests (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index admin_requests_actor_idx on private.admin_requests(actor_id,created_at desc);
alter table private.admin_requests enable row level security;
revoke all on private.admin_requests from public,anon,authenticated;
grant all on private.admin_requests to service_role;

create table private.media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('product-images','category-images')),
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  created_at timestamptz not null default now(),
  unique(bucket,path)
);
alter table private.media_cleanup_queue enable row level security;
revoke all on private.media_cleanup_queue from public,anon,authenticated;
grant all on private.media_cleanup_queue to service_role;
alter table public.orders add column stock_released_at timestamptz;

create function private.require_admin() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise insufficient_privilege using message='Admin required';
  end if;
end $$;
revoke all on function private.require_admin() from public,anon,authenticated;

create function private.admin_query(p_resource text,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  page_no integer; page_size integer; start_at integer; search text; entity_id uuid;
  items jsonb; total bigint; item jsonb;
begin
  perform private.require_admin();
  page_no := coalesce((p_options->>'page')::integer,1);
  page_size := coalesce((p_options->>'limit')::integer,20);
  search := trim(coalesce(p_options->>'search',''));
  entity_id := nullif(p_options->>'id','')::uuid;
  if page_no not between 1 and 100000 or page_size not between 1 and 100 or length(search)>120 then
    raise invalid_parameter_value using message='Invalid query';
  end if;
  start_at := (page_no-1)*page_size;
  case p_resource
  when 'dashboard' then
    return jsonb_build_object(
      'products',(select count(*) from public.products),
      'categories',(select count(*) from public.categories),
      'customers',(select count(*) from public.profiles),
      'orders',(select count(*) from public.orders),
      'pending_orders',(select count(*) from public.orders where status in ('confirmed','preparing')),
      'completed_orders',(select count(*) from public.orders where status='delivered'),
      'paid_orders',(select count(*) from public.orders where payment_status='paid' and status<>'cancelled'),
      'paid_total_cents',(select coalesce(sum(total_cents),0) from public.orders where payment_status='paid' and status<>'cancelled'),
      'low_stock_count',(select count(*) from public.products where active and status<>'archived' and stock_quantity<=minimum_stock),
      'low_stock',coalesce((select jsonb_agg(to_jsonb(t)) from (
        select id,name,sku,stock_quantity,minimum_stock from public.products
        where active and status<>'archived' and stock_quantity<=minimum_stock order by stock_quantity,id limit 8
      ) t),'[]'::jsonb),
      'recent_orders',coalesce((select jsonb_agg(to_jsonb(t)) from (
        select o.id,o.order_number,o.status,o.total_cents,o.created_at,p.full_name as customer_name
        from public.orders o join public.profiles p on p.id=o.user_id order by o.created_at desc,o.id limit 8
      ) t),'[]'::jsonb)
    );
  when 'products' then
    select count(*) into total from public.products p where
      (search='' or position(lower(search) in lower(p.name||' '||p.sku))>0)
      and (nullif(p_options->>'category','') is null or p.category_id=(p_options->>'category')::uuid)
      and (nullif(p_options->>'status','') is null or p.status=p_options->>'status')
      and (nullif(p_options->>'active','') is null or p.active=(p_options->>'active')::boolean)
      and (not coalesce((p_options->>'low_stock')::boolean,false) or p.stock_quantity<=p.minimum_stock);
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select p.*,c.name as category_name from public.products p join public.categories c on c.id=p.category_id where
        (search='' or position(lower(search) in lower(p.name||' '||p.sku))>0)
        and (nullif(p_options->>'category','') is null or p.category_id=(p_options->>'category')::uuid)
        and (nullif(p_options->>'status','') is null or p.status=p_options->>'status')
        and (nullif(p_options->>'active','') is null or p.active=(p_options->>'active')::boolean)
        and (not coalesce((p_options->>'low_stock')::boolean,false) or p.stock_quantity<=p.minimum_stock)
      order by case when p_options->>'sort'='name' then p.name end,
        case when p_options->>'sort'='stock' then p.stock_quantity end,
        case when p_options->>'sort'='price' then coalesce(p.sale_price_cents,p.price_cents) end,
        p.created_at desc,p.id limit page_size offset start_at
    ) t;
  when 'product' then
    select to_jsonb(p)||jsonb_build_object('category_name',c.name) into item
      from public.products p join public.categories c on c.id=p.category_id where p.id=entity_id;
    return item;
  when 'categories' then
    select count(*) into total from public.categories where search='' or position(lower(search) in lower(name))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select c.*,(select count(*) from public.products p where p.category_id=c.id) as product_count
      from public.categories c where search='' or position(lower(search) in lower(c.name))>0
      order by c.sort_order,c.name,c.id limit page_size offset start_at
    ) t;
  when 'category' then
    select to_jsonb(c) into item from public.categories c where id=entity_id; return item;
  when 'images' then
    select count(*) into total from public.product_images where product_id=entity_id;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select * from public.product_images where product_id=entity_id order by sort_order,id limit page_size offset start_at
    ) t;
  when 'stock' then
    select to_jsonb(p) into item from public.products p where id=entity_id;
    select count(*) into total from public.stock_movements where product_id=entity_id;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select m.*,p.full_name as actor_name from public.stock_movements m left join public.profiles p on p.id=m.actor_id
      where m.product_id=entity_id order by m.created_at desc,m.id limit page_size offset start_at
    ) t;
    return jsonb_build_object('product',item,'items',items,'total',total,'hasMore',start_at+page_size<total);
  when 'orders' then
    select count(*) into total from public.orders o where
      (search='' or position(lower(replace(search,'#','')) in lower(o.id::text))>0 or o.order_number::text=replace(search,'#',''))
      and (nullif(p_options->>'status','') is null or o.status=p_options->>'status');
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select o.id,o.order_number,o.user_id,o.status,o.payment_status,o.total_cents,o.created_at,o.updated_at,p.full_name as customer_name
      from public.orders o join public.profiles p on p.id=o.user_id where
        (search='' or position(lower(replace(search,'#','')) in lower(o.id::text))>0 or o.order_number::text=replace(search,'#',''))
        and (nullif(p_options->>'status','') is null or o.status=p_options->>'status')
      order by o.created_at desc,o.id limit page_size offset start_at
    ) t;
  when 'order' then
    select (to_jsonb(o)-'request_fingerprint'-'idempotency_key')||jsonb_build_object(
      'customer',jsonb_build_object('id',p.id,'full_name',p.full_name,'phone',p.phone,'email',u.email),
      'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
      'shipment',(select to_jsonb(s) from public.shipments s where s.order_id=o.id),
      'events',coalesce((select jsonb_agg(to_jsonb(e)) from (
        select e.* from public.shipment_events e join public.shipments s on s.id=e.shipment_id
        where s.order_id=o.id order by e.occurred_at desc,e.id limit 100
      ) e),'[]'::jsonb)) into item
    from public.orders o join public.profiles p on p.id=o.user_id left join auth.users u on u.id=p.id where o.id=entity_id;
    return item;
  when 'customers' then
    select count(*) into total from public.profiles p left join auth.users u on u.id=p.id
      where search='' or position(lower(search) in lower(p.full_name||' '||coalesce(u.email,'')||' '||coalesce(p.phone,'')))>0;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select p.id,p.full_name,p.phone,p.created_at,u.email,r.role,
        (select count(*) from public.orders o where o.user_id=p.id) as order_count
      from public.profiles p left join auth.users u on u.id=p.id left join public.user_roles r on r.user_id=p.id
      where search='' or position(lower(search) in lower(p.full_name||' '||coalesce(u.email,'')||' '||coalesce(p.phone,'')))>0
      order by p.created_at desc,p.id limit page_size offset start_at
    ) t;
  when 'customer' then
    select to_jsonb(p)||jsonb_build_object('email',u.email,'role',r.role,
      'order_count',(select count(*) from public.orders where user_id=p.id)) into item
      from public.profiles p left join auth.users u on u.id=p.id left join public.user_roles r on r.user_id=p.id where p.id=entity_id;
    select count(*) into total from public.orders where user_id=entity_id;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select id,order_number,status,payment_status,total_cents,created_at from public.orders
      where user_id=entity_id order by created_at desc,id limit page_size offset start_at
    ) t;
    return jsonb_build_object('customer',item,'items',items,'total',total,'hasMore',start_at+page_size<total);
  when 'settings' then
    select coalesce(jsonb_agg(to_jsonb(s) order by key),'[]'::jsonb) into items from public.store_settings s; return items;
  when 'orphans' then
    if p_options->>'bucket' not in ('product-images','category-images') or entity_id is null then raise invalid_parameter_value; end if;
    select count(*) into total from storage.objects o where o.bucket_id=p_options->>'bucket'
      and o.name like entity_id::text||'/%' and not private.media_is_linked(o.bucket_id,o.name);
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select o.bucket_id as bucket,o.name as path from storage.objects o where o.bucket_id=p_options->>'bucket'
        and o.name like entity_id::text||'/%' and not private.media_is_linked(o.bucket_id,o.name)
      order by o.name limit page_size offset start_at
    ) t;
  when 'cleanup' then
    select count(*) into total from private.media_cleanup_queue;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into items from (
      select * from private.media_cleanup_queue order by created_at,id limit page_size offset start_at
    ) t;
  else raise invalid_parameter_value using message='Unknown admin resource';
  end case;
  return jsonb_build_object('items',items,'total',total,'page',page_no,'hasMore',start_at+page_size<total);
end $$;
revoke all on function private.admin_query(text,jsonb) from public,anon,authenticated;
grant execute on function private.admin_query(text,jsonb) to authenticated;
create function public.admin_query(p_resource text,p_options jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.admin_query(p_resource,p_options); $$;
revoke all on function public.admin_query(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_query(text,jsonb) to authenticated;

create function private.media_is_linked(p_bucket text,p_path text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select (p_bucket='product-images' and exists(select 1 from public.product_images where storage_path=p_path))
    or (p_bucket='category-images' and exists(select 1 from public.categories where image_path=p_path));
$$;
revoke all on function private.media_is_linked(text,text) from public,anon,authenticated;
create function private.queue_media_cleanup(p_bucket text,p_path text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_path is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('pupi-media:'||p_bucket||':'||p_path,0));
  if private.media_is_linked(p_bucket,p_path) then raise exception 'media_still_linked'; end if;
  insert into private.media_cleanup_queue(bucket,path) values(p_bucket,p_path) on conflict(bucket,path) do nothing;
end $$;
revoke all on function private.queue_media_cleanup(text,text) from public,anon,authenticated;

create function private.guard_catalog_media_delete() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name='products' then
    if exists(select 1 from public.product_images where product_id=old.id) then raise exception 'remove_images_first'; end if;
  elsif old.image_path is not null then raise exception 'remove_images_first';
  end if;
  return old;
end $$;
revoke all on function private.guard_catalog_media_delete() from public,anon,authenticated;
create trigger protect_product_media before delete on public.products for each row execute function private.guard_catalog_media_delete();
create trigger protect_category_media before delete on public.categories for each row execute function private.guard_catalog_media_delete();

create function private.admin_mutate(p_operation text,p_id uuid,p_data jsonb,p_expected timestamptz,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); request_data jsonb; receipt private.admin_requests; result jsonb;
  product public.products; incoming public.products; category public.categories; image public.product_images;
  ord public.orders; delivery public.shipments; job private.media_cleanup_queue;
  old_reason text; new_state text; delivery_state text; old_path text; media_path text;
  delta integer; balance integer; row_data record; key_name text; existing_setting public.store_settings;
  value_data jsonb; is_new boolean;
begin
  perform private.require_admin();
  if p_request_key is null or p_data is null or jsonb_typeof(p_data)<>'object' then
    raise invalid_parameter_value using message='Invalid mutation';
  end if;
  request_data := jsonb_build_object('id',p_id,'data',p_data,'expected',p_expected);
  perform pg_advisory_xact_lock(hashtextextended('pupi-admin:'||p_request_key::text,0));
  select * into receipt from private.admin_requests where id=p_request_key;
  if found then
    if receipt.actor_id<>actor or receipt.operation<>p_operation or receipt.payload<>request_data then
      raise exception 'request_key_reused';
    end if;
    return receipt.result;
  end if;

  case p_operation
  when 'product_save' then
    if exists(select 1 from jsonb_object_keys(p_data) as k(key) where key not in
      ('category_id','sku','slug','name','title','short_description','description','price_cents','sale_price_cents',
      'minimum_stock','weight_grams','width_mm','height_mm','length_mm','featured','active','status')) then
      raise invalid_parameter_value using message='Invalid product fields';
    end if;
    if p_id is not null then
      select * into product from public.products where id=p_id for update;
      if not found then raise no_data_found; end if;
      if p_expected is null or product.updated_at<>p_expected then raise serialization_failure; end if;
    end if;
    incoming := jsonb_populate_record(product,p_data);
    incoming.active := coalesce(incoming.active,true);
    incoming.status := coalesce(incoming.status,'draft');
    incoming.minimum_stock := coalesce(incoming.minimum_stock,
      (select (value#>>'{}')::integer from public.store_settings where key='low_stock_threshold'),0);
    if incoming.active and incoming.status='published' and not exists(
      select 1 from public.categories where id=incoming.category_id and active
    ) then raise exception 'category_not_active'; end if;
    if p_id is null then
      insert into public.products(category_id,sku,slug,name,title,short_description,description,price_cents,sale_price_cents,
        minimum_stock,weight_grams,width_mm,height_mm,length_mm,featured,active,status)
      values(incoming.category_id,trim(incoming.sku),incoming.slug,trim(incoming.name),coalesce(incoming.title,''),
        coalesce(incoming.short_description,''),coalesce(incoming.description,''),incoming.price_cents,incoming.sale_price_cents,
        incoming.minimum_stock,incoming.weight_grams,incoming.width_mm,incoming.height_mm,incoming.length_mm,
        coalesce(incoming.featured,false),incoming.active,incoming.status) returning * into product;
    else
      update public.products set category_id=incoming.category_id,sku=trim(incoming.sku),slug=incoming.slug,name=trim(incoming.name),
        title=incoming.title,short_description=incoming.short_description,description=incoming.description,
        price_cents=incoming.price_cents,sale_price_cents=incoming.sale_price_cents,minimum_stock=incoming.minimum_stock,
        weight_grams=incoming.weight_grams,width_mm=incoming.width_mm,height_mm=incoming.height_mm,length_mm=incoming.length_mm,
        featured=incoming.featured,active=incoming.active,status=incoming.status where id=p_id returning * into product;
    end if;
    result := to_jsonb(product);
  when 'product_remove' then
    select * into product from public.products where id=p_id for update;
    if not found then raise no_data_found; end if;
    if p_expected is null or product.updated_at<>p_expected then raise serialization_failure; end if;
    if exists(select 1 from public.stock_movements where product_id=p_id)
      or exists(select 1 from public.order_items where product_id=p_id) then raise exception 'product_has_history'; end if;
    delete from public.products where id=p_id;
    result := jsonb_build_object('id',p_id);
  when 'category_save' then
    if exists(select 1 from jsonb_object_keys(p_data) as k(key) where key not in ('name','slug','description','sort_order','active')) then
      raise invalid_parameter_value using message='Invalid category fields'; end if;
    if p_id is null then
      insert into public.categories(name,slug,description,sort_order,active)
      values(trim(p_data->>'name'),p_data->>'slug',coalesce(p_data->>'description',''),coalesce((p_data->>'sort_order')::integer,0),
        coalesce((p_data->>'active')::boolean,true)) returning * into category;
    else
      select * into category from public.categories where id=p_id for update;
      if not found then raise no_data_found; end if;
      if p_expected is null or category.updated_at<>p_expected then raise serialization_failure; end if;
      update public.categories set name=trim(p_data->>'name'),slug=p_data->>'slug',description=coalesce(p_data->>'description',''),
        sort_order=(p_data->>'sort_order')::integer,active=(p_data->>'active')::boolean where id=p_id returning * into category;
    end if;
    result := to_jsonb(category);
  when 'category_remove' then
    select * into category from public.categories where id=p_id for update;
    if not found then raise no_data_found; end if;
    if p_expected is null or category.updated_at<>p_expected then raise serialization_failure; end if;
    if exists(select 1 from public.products where category_id=p_id) then raise exception 'category_has_products'; end if;
    delete from public.categories where id=p_id;
    result := jsonb_build_object('id',p_id);
  when 'stock_adjust' then
    select * into product from public.products where id=p_id for update;
    if not found then raise no_data_found; end if;
    if not p_data?'expected_balance' or (p_data->>'expected_balance') is null then raise invalid_parameter_value; end if;
    if product.stock_quantity<>(p_data->>'expected_balance')::integer then raise serialization_failure; end if;
    delta := (p_data->>'delta')::integer;
    balance := private.adjust_stock(p_id,delta,p_data->>'reason');
    result := jsonb_build_object('id',p_id,'balance',balance);
  when 'image_link' then
    select * into product from public.products where id=p_id for update;
    if not found then raise no_data_found; end if;
    media_path := p_data->>'path';
    if media_path is null or media_path!~('^'||p_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise invalid_parameter_value; end if;
    perform pg_advisory_xact_lock(hashtextextended('pupi-media:product-images:'||media_path,0));
    if exists(select 1 from private.media_cleanup_queue where bucket='product-images' and media_cleanup_queue.path=media_path) then raise exception 'media_removal_pending'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='product-images' and o.name=media_path) then raise exception 'media_not_uploaded'; end if;
    select * into image from public.product_images where storage_path=media_path;
    if found then result:=to_jsonb(image);
    else
      is_new := not exists(select 1 from public.product_images where product_id=p_id);
      insert into public.product_images(product_id,storage_path,alt_text,sort_order,is_primary)
        values(p_id,media_path,coalesce(p_data->>'alt_text',''),coalesce((p_data->>'sort_order')::integer,0),is_new) returning * into image;
      update public.products set updated_at=now() where id=p_id;
      result:=to_jsonb(image);
    end if;
  when 'image_update' then
    select * into image from public.product_images where id=p_id;
    if not found then raise no_data_found; end if;
    perform id from public.products where id=image.product_id for update;
    select * into image from public.product_images where id=p_id for update;
    if not found then raise no_data_found; end if;
    if coalesce((p_data->>'is_primary')::boolean,false) then
      update public.product_images set is_primary=false where product_id=image.product_id and is_primary;
    end if;
    update public.product_images set alt_text=coalesce(p_data->>'alt_text',alt_text),
      sort_order=coalesce((p_data->>'sort_order')::integer,sort_order),
      is_primary=coalesce((p_data->>'is_primary')::boolean,is_primary) where id=p_id returning * into image;
    update public.products set updated_at=now() where id=image.product_id;
    result:=to_jsonb(image);
  when 'image_remove' then
    select * into image from public.product_images where id=p_id;
    if not found then raise no_data_found; end if;
    perform id from public.products where id=image.product_id for update;
    select * into image from public.product_images where id=p_id for update;
    if not found then raise no_data_found; end if;
    delete from public.product_images where id=p_id;
    if image.is_primary then
      update public.product_images set is_primary=true where id=(select id from public.product_images where product_id=image.product_id order by sort_order,id limit 1);
    end if;
    perform private.queue_media_cleanup('product-images',image.storage_path);
    update public.products set updated_at=now() where id=image.product_id;
    result:=jsonb_build_object('id',p_id,'product_id',image.product_id);
  when 'category_image' then
    select * into category from public.categories where id=p_id for update;
    if not found then raise no_data_found; end if;
    if p_expected is null or category.updated_at<>p_expected then raise serialization_failure; end if;
    media_path := nullif(p_data->>'path',''); old_path:=category.image_path;
    if media_path is not null then
      perform pg_advisory_xact_lock(hashtextextended('pupi-media:category-images:'||media_path,0));
      if exists(select 1 from private.media_cleanup_queue q where q.bucket='category-images' and q.path=media_path) then raise exception 'media_removal_pending'; end if;
      if not exists(select 1 from storage.objects o where o.bucket_id='category-images' and o.name=media_path) then raise exception 'media_not_uploaded'; end if;
    end if;
    update public.categories set image_path=media_path where id=p_id returning * into category;
    if old_path is distinct from media_path then perform private.queue_media_cleanup('category-images',old_path); end if;
    result:=to_jsonb(category);
  when 'cleanup_enqueue' then
    perform private.queue_media_cleanup(p_data->>'bucket',p_data->>'path');
    result:=jsonb_build_object('queued',true);
  when 'cleanup_complete' then
    select * into job from private.media_cleanup_queue where id=p_id for update;
    if not found then result:=jsonb_build_object('id',p_id);
    else
      if exists(select 1 from storage.objects o where o.bucket_id=job.bucket and o.name=job.path) then raise exception 'media_file_exists'; end if;
      delete from private.media_cleanup_queue where id=p_id;
      result:=jsonb_build_object('id',p_id);
    end if;
  when 'order_update' then
    select * into ord from public.orders where id=p_id for update;
    if not found then raise no_data_found; end if;
    if p_expected is null or ord.updated_at<>p_expected then raise serialization_failure; end if;
    new_state:=p_data->>'status';
    if new_state='cancelled' and ord.status<>'cancelled' then
      if ord.payment_status='paid' then raise exception 'paid_order_refund_required'; end if;
      if ord.status in ('confirmed','preparing') and ord.stock_released_at is null then
        perform p.id from public.products p join public.order_items i on i.product_id=p.id where i.order_id=p_id order by p.id for update of p;
        old_reason:=current_setting('pupi.stock_reason',true);
        perform set_config('pupi.stock_reason','cancel:'||p_id::text,true);
        for row_data in select product_id,quantity from public.order_items where order_id=p_id order by product_id loop
          update public.products set stock_quantity=stock_quantity+row_data.quantity where id=row_data.product_id;
        end loop;
        perform set_config('pupi.stock_reason',coalesce(old_reason,''),true);
        update public.orders set stock_released_at=now() where id=p_id;
      end if;
    end if;
    -- O trigger existente valida as transições e mantém snapshots e valores imutáveis.
    update public.orders set status=new_state where id=p_id returning * into ord;
    select * into delivery from public.shipments where order_id=p_id for update;
    delivery_state:=case new_state when 'shipped' then 'posted' when 'in_transit' then 'in_transit'
      when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
      when 'delivery_failed' then 'failed' when 'cancelled' then 'cancelled' else 'pending' end;
    if delivery.id is not null or new_state in ('shipped','in_transit','out_for_delivery','delivered','delivery_failed')
      or nullif(trim(p_data->>'carrier'),'') is not null then
      if length(coalesce(p_data->>'carrier',''))>120 or length(coalesce(p_data->>'service_name',''))>120
        or length(coalesce(p_data->>'tracking_code',''))>120 or length(coalesce(p_data->>'note',''))>800 then raise invalid_parameter_value; end if;
      if delivery.id is null then
        if nullif(trim(p_data->>'carrier'),'') is null then raise exception 'carrier_required'; end if;
        insert into public.shipments(order_id,provider,carrier,service_name,tracking_code,status)
          values(p_id,'manual',trim(p_data->>'carrier'),nullif(trim(p_data->>'service_name'),''),nullif(trim(p_data->>'tracking_code'),''),delivery_state) returning * into delivery;
      else
        update public.shipments set carrier=coalesce(nullif(trim(p_data->>'carrier'),''),carrier),
          service_name=nullif(trim(p_data->>'service_name'),''),tracking_code=nullif(trim(p_data->>'tracking_code'),''),status=delivery_state
          where id=delivery.id returning * into delivery;
      end if;
      insert into public.shipment_events(shipment_id,provider_event_id,status,description,occurred_at)
        values(delivery.id,'manual:'||p_request_key::text,delivery_state,
          coalesce(nullif(trim(p_data->>'note'),''),'Atualização manual do painel: '||new_state),now());
    end if;
    result:=(to_jsonb(ord)-'request_fingerprint'-'idempotency_key')||jsonb_build_object('shipment',to_jsonb(delivery));
  when 'settings_save' then
    perform pg_advisory_xact_lock(hashtextextended('pupi-settings',0));
    if jsonb_typeof(p_data->'values') is distinct from 'object' or exists(
      select 1 from jsonb_object_keys(p_data->'values') as k(key) where key not in ('store_name','contact_email','origin_postal_code','low_stock_threshold')
    ) then raise invalid_parameter_value; end if;
    foreach key_name in array array['store_name','contact_email','origin_postal_code','low_stock_threshold'] loop
      value_data:=p_data->'values'->key_name;
      if value_data is null or jsonb_typeof(value_data)='null' then raise invalid_parameter_value; end if;
      if key_name='store_name' and (jsonb_typeof(value_data)<>'string' or length(trim(value_data#>>'{}')) not between 1 and 160) then raise invalid_parameter_value; end if;
      if key_name='contact_email' and (jsonb_typeof(value_data)<>'string' or (value_data#>>'{}')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise invalid_parameter_value; end if;
      if key_name='origin_postal_code' and (value_data#>>'{}')!~'^[0-9]{8}$' then raise invalid_parameter_value; end if;
      if key_name='low_stock_threshold' and (jsonb_typeof(value_data)<>'number' or (value_data#>>'{}')!~'^[0-9]+$' or (value_data#>>'{}')::bigint>2147483647) then raise invalid_parameter_value; end if;
      select * into existing_setting from public.store_settings where key=key_name for update;
      if found then
        if (p_data->'expected'->>key_name) is null or existing_setting.updated_at<>(p_data->'expected'->>key_name)::timestamptz then raise serialization_failure; end if;
        update public.store_settings set value=value_data where key=key_name;
      else
        if (p_data->'expected'->>key_name) is not null then raise serialization_failure; end if;
        insert into public.store_settings(key,value) values(key_name,value_data);
      end if;
    end loop;
    result:=jsonb_build_object('saved',true);
  else raise invalid_parameter_value using message='Unknown admin operation';
  end case;
  insert into private.admin_requests(id,actor_id,operation,payload,result) values(p_request_key,actor,p_operation,request_data,result);
  return result;
end $$;
revoke all on function private.admin_mutate(text,uuid,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function private.admin_mutate(text,uuid,jsonb,timestamptz,uuid) to authenticated;
create function public.admin_mutate(p_operation text,p_id uuid,p_data jsonb,p_expected timestamptz,p_request_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_mutate(p_operation,p_id,p_data,p_expected,p_request_key);
$$;
revoke all on function public.admin_mutate(text,uuid,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.admin_mutate(text,uuid,jsonb,timestamptz,uuid) to authenticated;
commit;
