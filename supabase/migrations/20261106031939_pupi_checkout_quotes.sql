begin;
-- Cotações são gravadas apenas pelo backend confiável após resposta da transportadora.
create table private.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  address_id uuid not null references public.addresses(id) on delete restrict,
  snapshot jsonb not null,
  shipping_cents integer not null check (shipping_cents >= 0),
  carrier text not null check (length(trim(carrier)) between 1 and 120),
  service_name text not null check (length(trim(service_name)) between 1 and 120),
  service_id text not null check (length(trim(service_id)) between 1 and 120),
  expires_at timestamptz not null,
  request_key uuid,
  order_id uuid references public.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,request_key),
  unique(order_id),
  check ((request_key is null) = (order_id is null))
);
create index shipping_quotes_owner_idx on private.shipping_quotes(user_id,created_at desc);
alter table private.shipping_quotes enable row level security;
revoke all on private.shipping_quotes from public,anon,authenticated;
grant all on private.shipping_quotes to service_role;

-- A Edge Function autentica a sessão e passa o UUID obtido do Auth, nunca do corpo.
create function private.quote_snapshot(p_user_id uuid,p_address_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare address_version timestamptz; v_cart_id uuid; result jsonb; item_count integer; origin text; destination text;
begin
  select value#>>'{}' into origin from public.store_settings where key='origin_postal_code';
  if origin is null or origin !~ '^[0-9]{8}$' then raise invalid_parameter_value using message='origin_not_configured'; end if;
  select updated_at,postal_code into address_version,destination from public.addresses where id=p_address_id and user_id=p_user_id;
  if not found then raise invalid_parameter_value using message='address_not_owned'; end if;
  select id into v_cart_id from public.carts where user_id=p_user_id;
  if not found then raise invalid_parameter_value using message='cart_empty'; end if;
  select count(*) into item_count from public.cart_items where cart_items.cart_id=v_cart_id;
  if item_count not between 1 and 100 then raise invalid_parameter_value using message='invalid_cart_size'; end if;
  if exists(select 1 from public.cart_items i join public.products p on p.id=i.product_id
    join public.categories c on c.id=p.category_id where i.cart_id=v_cart_id
    and (not p.active or p.status<>'published' or not c.active or p.stock_quantity<i.quantity
      or p.weight_grams is null or p.width_mm is null or p.height_mm is null or p.length_mm is null))
    then raise check_violation using message='cart_unavailable_or_dimensions_missing'; end if;
  select jsonb_build_object('address_id',p_address_id,'address_updated_at',address_version,
    'cart_id',v_cart_id,'origin_postal_code',origin,'destination_postal_code',destination,'items',jsonb_agg(jsonb_build_object(
      'product_id',i.product_id,'quantity',i.quantity,'product_updated_at',p.updated_at,
      'price_cents',coalesce(p.sale_price_cents,p.price_cents),'weight_grams',p.weight_grams,
      'width_mm',p.width_mm,'height_mm',p.height_mm,'length_mm',p.length_mm) order by i.product_id))
    into result from public.cart_items i join public.products p on p.id=i.product_id where i.cart_id=v_cart_id;
  return result;
end $$;
revoke all on function private.quote_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function private.quote_snapshot(uuid,uuid) to service_role;
create function public.service_quote_snapshot(p_user_id uuid,p_address_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.quote_snapshot(p_user_id,p_address_id); $$;
revoke all on function public.service_quote_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_quote_snapshot(uuid,uuid) to service_role;

create function public.service_register_shipping_quote(p_user_id uuid,p_address_id uuid,p_snapshot jsonb,
  p_shipping_cents integer,p_carrier text,p_service_name text,p_service_id text,p_expires_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare quote_id uuid;
begin
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '30 minutes'
    or p_snapshot is distinct from private.quote_snapshot(p_user_id,p_address_id) then
    raise serialization_failure using message='quote_stale';
  end if;
  insert into private.shipping_quotes(user_id,address_id,snapshot,shipping_cents,carrier,service_name,service_id,expires_at)
    values(p_user_id,p_address_id,p_snapshot,p_shipping_cents,trim(p_carrier),trim(p_service_name),trim(p_service_id),p_expires_at)
    returning id into quote_id;
  return quote_id;
end $$;
revoke all on function public.service_register_shipping_quote(uuid,uuid,jsonb,integer,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.service_register_shipping_quote(uuid,uuid,jsonb,integer,text,text,text,timestamptz) to service_role;

create function public.service_confirm_shipping_order(p_user_id uuid,p_quote_id uuid,p_request_key uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare quote private.shipping_quotes%rowtype; existing private.shipping_quotes%rowtype; current_snapshot jsonb; order_id_new uuid; items jsonb;
begin
  if p_user_id is null or p_quote_id is null or p_request_key is null then raise invalid_parameter_value; end if;
  perform pg_advisory_xact_lock(hashtextextended('pupi-checkout:'||p_user_id::text||':'||p_request_key::text,0));
  select * into existing from private.shipping_quotes where user_id=p_user_id and request_key=p_request_key;
  if found then
    if existing.id<>p_quote_id then raise invalid_parameter_value using message='request_key_reused'; end if;
    return existing.order_id;
  end if;
  select * into quote from private.shipping_quotes where id=p_quote_id and user_id=p_user_id for update;
  if not found then raise insufficient_privilege using message='quote_not_found'; end if;
  if quote.order_id is not null then raise invalid_parameter_value using message='quote_already_used'; end if;
  if quote.expires_at<=now() then raise serialization_failure using message='quote_expired'; end if;
  perform key from public.store_settings where key='origin_postal_code' for share;
  perform id from public.addresses where id=quote.address_id and user_id=p_user_id for share;
  perform id from public.carts where id=(quote.snapshot->>'cart_id')::uuid and user_id=p_user_id for update;
  perform id from public.cart_items where cart_id=(quote.snapshot->>'cart_id')::uuid order by id for update;
  perform p.id from public.products p join public.cart_items i on i.product_id=p.id
    where i.cart_id=(quote.snapshot->>'cart_id')::uuid order by p.id for update of p;
  current_snapshot:=private.quote_snapshot(p_user_id,quote.address_id);
  if quote.snapshot is distinct from current_snapshot then raise serialization_failure using message='quote_stale'; end if;
  select jsonb_agg(jsonb_build_object('product_id',x->>'product_id','quantity',(x->>'quantity')::integer) order by x->>'product_id')
    into items from jsonb_array_elements(quote.snapshot->'items') x;
  order_id_new:=private.create_order(p_user_id,quote.address_id,items,quote.shipping_cents,p_request_key);
  insert into public.shipments(order_id,provider,carrier,service_name,status)
    values(order_id_new,'melhor_envio',quote.carrier,quote.service_name,'pending');
  delete from public.cart_items where cart_id=(quote.snapshot->>'cart_id')::uuid;
  update private.shipping_quotes set request_key=p_request_key,order_id=order_id_new where id=p_quote_id;
  return order_id_new;
end $$;
revoke all on function public.service_confirm_shipping_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_confirm_shipping_order(uuid,uuid,uuid) to service_role;
commit;
