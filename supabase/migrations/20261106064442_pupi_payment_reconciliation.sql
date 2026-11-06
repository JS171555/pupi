begin;
alter table private.payment_attempts drop constraint payment_attempts_status_check;
alter table private.payment_attempts add constraint payment_attempts_status_check check(status in ('started','ready'));
alter table private.payment_attempts add column preference_id text unique;
alter table private.payment_attempts add column checkout_url text;
alter table private.payment_attempts add constraint payment_preference_check check ((status='ready')=(preference_id is not null and checkout_url is not null));
create table private.provider_payments (
  payment_id text primary key check(payment_id ~ '^[0-9]{1,30}$'),
  order_id uuid not null references private.payment_attempts(order_id) on delete restrict,
  state text not null check(state in ('pending','paid','refunded','review','failed')),
  provider_updated_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index provider_payments_order_idx on private.provider_payments(order_id);
alter table private.provider_payments enable row level security;
revoke all on private.provider_payments from public,anon,authenticated;
grant all on private.provider_payments to service_role;

create or replace function private.guard_payment_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if ((new.status='cancelled' and old.status<>'cancelled') or (new.stock_released_at is distinct from old.stock_released_at and new.stock_released_at is not null))
    and exists(select 1 from private.payment_attempts where order_id=old.id and status in ('started','ready')) then
    raise exception 'payment_attempt_pending';
  end if;
  return new;
end $$;

create function public.service_payment_attempt_state(p_user_id uuid,p_order_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ord public.orders%rowtype; a private.payment_attempts%rowtype;
begin
  select * into ord from public.orders where id=p_order_id;
  if not found or ord.user_id<>p_user_id then raise insufficient_privilege using message='order_not_owned'; end if;
  select * into a from private.payment_attempts where order_id=ord.id;
  if not found then return null; end if;
  return jsonb_build_object('status',a.status,'attempt_id',a.attempt_id,'checkout_url',case when ord.status in ('confirmed','preparing') and ord.payment_status='pending' then a.checkout_url else null end);
end $$;
revoke all on function public.service_payment_attempt_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_payment_attempt_state(uuid,uuid) to service_role;

create function public.service_finish_payment_preference(p_user_id uuid,p_order_id uuid,p_attempt_id uuid,p_preference_id text,p_checkout_url text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a private.payment_attempts%rowtype;
begin
  perform 1 from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise insufficient_privilege; end if;
  select * into a from private.payment_attempts where order_id=p_order_id for update;
  if not found or a.attempt_id<>p_attempt_id then raise invalid_parameter_value; end if;
  if a.status='ready' then return a.preference_id=p_preference_id and a.checkout_url=p_checkout_url; end if;
  if p_preference_id is null or length(p_preference_id) not between 1 and 200 or p_preference_id !~ '^[A-Za-z0-9_-]+$' or p_checkout_url is null or length(p_checkout_url)>2048 or p_checkout_url !~ '^https://(www|sandbox)\.mercadopago\.(com|com\.br)/' then raise invalid_parameter_value; end if;
  update private.payment_attempts set status='ready',preference_id=p_preference_id,checkout_url=p_checkout_url where order_id=p_order_id;
  return true;
end $$;
revoke all on function public.service_finish_payment_preference(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.service_finish_payment_preference(uuid,uuid,uuid,text,text) to service_role;

create function public.service_payment_context(p_order_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('order_id',o.id,'total_cents',o.total_cents,'currency',o.currency,'status',o.status,'payment_status',o.payment_status)
  from public.orders o join private.payment_attempts a on a.order_id=o.id where o.id=p_order_id;
$$;
revoke all on function public.service_payment_context(uuid) from public,anon,authenticated;
grant execute on function public.service_payment_context(uuid) to service_role;

-- Apenas o backend, após consultar e conferir o provedor, chama esta função.
create function public.service_apply_provider_payment(p_order_id uuid,p_payment_id text,p_state text,p_updated_at timestamptz,p_total_cents bigint) returns text
language plpgsql security invoker set search_path='' as $$
declare ord public.orders%rowtype; previous private.provider_payments%rowtype; paid_count int; total_count int;
begin
  if p_payment_id is null or p_payment_id !~ '^[0-9]{1,30}$' or p_state not in ('pending','paid','refunded','review','failed') or p_updated_at is null or p_updated_at>now()+interval '1 day' then raise invalid_parameter_value; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found or ord.status='cancelled' or ord.total_cents<>p_total_cents or not exists(select 1 from private.payment_attempts where order_id=ord.id) then raise invalid_parameter_value; end if;
  select * into previous from private.provider_payments where payment_id=p_payment_id for update;
  if found and previous.order_id<>p_order_id then raise unique_violation; end if;
  if found and previous.provider_updated_at>p_updated_at then return 'stale'; end if;
  if found and previous.provider_updated_at=p_updated_at then
    if previous.state<>p_state then raise serialization_failure using message='payment_event_conflict'; end if;
    return 'duplicate';
  end if;
  insert into private.provider_payments(payment_id,order_id,state,provider_updated_at) values(p_payment_id,p_order_id,p_state,p_updated_at)
    on conflict(payment_id) do update set state=excluded.state,provider_updated_at=excluded.provider_updated_at,received_at=now()
      where private.provider_payments.order_id=excluded.order_id and private.provider_payments.provider_updated_at<excluded.provider_updated_at;
  if not found then raise serialization_failure using message='payment_event_conflict'; end if;
  select count(*) filter(where state='paid'),count(*) filter(where state<>'failed') into paid_count,total_count from private.provider_payments where order_id=p_order_id;
  -- Mais de um pagamento ou qualquer disputa requer revisão, sem simular estorno.
  if total_count>1 or p_state='review' then return 'review'; end if;
  if paid_count=1 and ord.payment_status='pending' then update public.orders set payment_status='paid' where id=p_order_id; return 'paid'; end if;
  if p_state='refunded' and ord.payment_status='paid' then update public.orders set payment_status='refunded' where id=p_order_id; return 'refunded'; end if;
  return 'pending';
end $$;
revoke all on function public.service_apply_provider_payment(uuid,text,text,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.service_apply_provider_payment(uuid,text,text,timestamptz,bigint) to service_role;
create function private.admin_payment_review(p_order_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_admin() then raise insufficient_privilege; end if;
  return (select count(*) filter(where state<>'failed')>1 or coalesce(bool_or(state='review'),false) from private.provider_payments where order_id=p_order_id);
end $$;
revoke all on function private.admin_payment_review(uuid) from public,anon,authenticated;
grant execute on function private.admin_payment_review(uuid) to authenticated;
create function public.admin_payment_review(p_order_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select private.admin_payment_review(p_order_id); $$;
revoke all on function public.admin_payment_review(uuid) from public,anon,authenticated;
grant execute on function public.admin_payment_review(uuid) to authenticated;
commit;
