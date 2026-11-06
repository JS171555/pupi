begin;
alter table private.payment_attempts add column checkout_kind text not null default 'pro' check(checkout_kind in ('pro','transparent'));
create table private.transparent_submissions (
  request_key uuid primary key,
  order_id uuid not null references private.payment_attempts(order_id) on delete restrict,
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid not null unique default gen_random_uuid(),
  state text not null default 'started' check(state in ('started','pending','paid','failed','refunded','review')),
  payment_id text unique references private.provider_payments(payment_id) on delete restrict,
  result jsonb,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now()
);
create index transparent_submissions_order_idx on private.transparent_submissions(order_id,created_at desc);
create unique index transparent_one_started on private.transparent_submissions(order_id) where state='started';
alter table private.transparent_submissions enable row level security;
revoke all on private.transparent_submissions from public,anon,authenticated;
grant all on private.transparent_submissions to service_role;

create function public.service_transparent_context(p_user_id uuid,p_order_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare ord public.orders%rowtype; a private.payment_attempts%rowtype; s private.transparent_submissions%rowtype;
begin
  if p_user_id is null then raise insufficient_privilege; end if;
  select * into ord from public.orders where id=p_order_id;
  if not found or ord.user_id<>p_user_id then raise insufficient_privilege; end if;
  select * into a from private.payment_attempts where order_id=ord.id;
  if found and a.checkout_kind='pro' then raise exception 'legacy_payment_attempt'; end if;
  select * into s from private.transparent_submissions where order_id=ord.id order by (state='failed'),created_at desc,request_key desc limit 1;
  return jsonb_build_object('order_id',ord.id,'order_number',ord.order_number,'total_cents',ord.total_cents,'order_status',ord.status,'payment_status',ord.payment_status,
    'submission',case when s.request_key is null then null else jsonb_build_object('request_key',s.request_key,'state',s.state,'result',s.result) end);
end $$;
revoke all on function public.service_transparent_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_transparent_context(uuid,uuid) to service_role;

create function public.service_begin_transparent_payment(p_user_id uuid,p_order_id uuid,p_request_key uuid,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ord public.orders%rowtype; a private.payment_attempts%rowtype; s private.transparent_submissions%rowtype;
begin
  if p_user_id is null or p_request_key is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise invalid_parameter_value; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found or ord.user_id<>p_user_id then raise insufficient_privilege; end if;
  select * into a from private.payment_attempts where order_id=ord.id;
  if found and a.checkout_kind<>'transparent' then raise exception 'legacy_payment_attempt'; end if;
  select * into s from private.transparent_submissions where request_key=p_request_key;
  if found then
    if s.order_id<>ord.id or s.fingerprint<>p_fingerprint then raise exception 'payment_request_reused'; end if;
    return jsonb_build_object('can_submit',s.state='started','idempotency_key',s.idempotency_key,'state',s.state,'result',s.result);
  end if;
  if ord.status not in ('confirmed','preparing') or ord.payment_status<>'pending' or ord.stock_released_at is not null then raise invalid_parameter_value; end if;
  select * into s from private.transparent_submissions where order_id=ord.id and state<>'failed' order by created_at desc limit 1;
  if found then return jsonb_build_object('can_submit',false,'state',s.state,'result',s.result); end if;
  if a.order_id is null then
    perform public.service_begin_payment_attempt(p_user_id,p_order_id,gen_random_uuid());
    update private.payment_attempts set checkout_kind='transparent' where order_id=ord.id;
  end if;
  insert into private.transparent_submissions(request_key,order_id,fingerprint) values(p_request_key,ord.id,p_fingerprint) returning * into s;
  return jsonb_build_object('can_submit',true,'idempotency_key',s.idempotency_key,'state','started');
end $$;
revoke all on function public.service_begin_transparent_payment(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.service_begin_transparent_payment(uuid,uuid,uuid,text) to service_role;

create function public.service_complete_transparent_payment(p_order_id uuid,p_request_key uuid,p_payment_id text,p_state text,p_updated_at timestamptz,p_result jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare s private.transparent_submissions%rowtype;
begin
  perform id from public.orders where id=p_order_id for update;
  select * into s from private.transparent_submissions where order_id=p_order_id and request_key=p_request_key for update;
  if not found then return false; end if;
  if p_state is null or p_state not in ('pending','paid','failed','refunded','review') or p_updated_at is null or p_result is null or jsonb_typeof(p_result)<>'object' then raise invalid_parameter_value; end if;
  if not exists(select 1 from private.provider_payments where payment_id=p_payment_id and order_id=p_order_id) or (s.payment_id is not null and s.payment_id<>p_payment_id) then raise invalid_parameter_value; end if;
  if s.provider_updated_at is not null and s.provider_updated_at>p_updated_at then return true; end if;
  update private.transparent_submissions set payment_id=p_payment_id,state=p_state,result=p_result,provider_updated_at=p_updated_at where request_key=p_request_key;
  return true;
end $$;
revoke all on function public.service_complete_transparent_payment(uuid,uuid,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.service_complete_transparent_payment(uuid,uuid,text,text,timestamptz,jsonb) to service_role;
create function public.service_reject_transparent_payment(p_order_id uuid,p_request_key uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  perform id from public.orders where id=p_order_id for update;
  update private.transparent_submissions set state='failed',result=jsonb_build_object('status','failed')
    where order_id=p_order_id and request_key=p_request_key and state='started' and payment_id is null;
  return found;
end $$;
revoke all on function public.service_reject_transparent_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_reject_transparent_payment(uuid,uuid) to service_role;
commit;
