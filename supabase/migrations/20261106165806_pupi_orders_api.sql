begin;
alter table private.transparent_submissions
  add column api_kind text not null default 'payments' check(api_kind in ('payments','orders')),
  add column provider_mode text check(provider_mode in ('sandbox','production')),
  add column collector_id text check(collector_id ~ '^[0-9]{1,30}$');
alter table private.transparent_submissions add constraint order_submission_config_check
  check(api_kind<>'orders' or (provider_mode is not null and collector_id is not null));
alter table private.provider_payments drop constraint provider_payments_payment_id_check;
alter table private.provider_payments add constraint provider_payments_payment_id_check
  check(payment_id ~ '^([0-9]{1,30}|ORD[A-Z0-9]{10,60})$');
create or replace function public.service_transparent_context(p_user_id uuid,p_order_id uuid) returns jsonb
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
    'submission',case when s.request_key is null then null else jsonb_build_object('request_key',s.request_key,'state',s.state,'result',s.result,'api_kind',s.api_kind,'created_at',s.created_at,'provider_mode',s.provider_mode,'collector_id',s.collector_id) end);
end $$;
revoke all on function public.service_transparent_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_transparent_context(uuid,uuid) to service_role;

create or replace function public.service_apply_provider_payment(p_order_id uuid,p_payment_id text,p_state text,p_updated_at timestamptz,p_total_cents bigint) returns text
language plpgsql security invoker set search_path='' as $$
declare ord public.orders%rowtype; previous private.provider_payments%rowtype; paid_count int; total_count int;
begin
  if p_payment_id is null or p_payment_id !~ '^([0-9]{1,30}|ORD[A-Z0-9]{10,60})$' or p_state not in ('pending','paid','refunded','review','failed') or p_updated_at is null or p_updated_at>now()+interval '1 day' then raise invalid_parameter_value; end if;
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

-- A mesma reserva e as mesmas travas do checkout anterior; identifica o contrato novo.
create function public.service_begin_order_payment(p_user_id uuid,p_order_id uuid,p_request_key uuid,p_fingerprint text,p_mode text,p_collector_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s private.transparent_submissions%rowtype; result jsonb; fresh boolean;
begin
  if p_mode is null or p_mode not in ('sandbox','production') or p_collector_id is null or p_collector_id !~ '^[0-9]{1,30}$' then raise invalid_parameter_value; end if;
  perform id from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise insufficient_privilege; end if;
  select * into s from private.transparent_submissions where request_key=p_request_key;
  fresh=not found;
  if not fresh and (s.api_kind<>'orders' or s.provider_mode<>p_mode or s.collector_id<>p_collector_id) then raise exception 'payment_configuration_changed'; end if;
  result=public.service_begin_transparent_payment(p_user_id,p_order_id,p_request_key,p_fingerprint);
  if fresh and (result->>'can_submit')::boolean then
    update private.transparent_submissions set api_kind='orders',provider_mode=p_mode,collector_id=p_collector_id
      where request_key=p_request_key and order_id=p_order_id;
  end if;
  return result || jsonb_build_object('fresh',fresh);
end $$;
revoke all on function public.service_begin_order_payment(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.service_begin_order_payment(uuid,uuid,uuid,text,text,text) to service_role;

create function public.service_orders_payment_context(p_request_key uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('order_id',o.id,'total_cents',o.total_cents,'request_key',s.request_key,
    'provider_mode',s.provider_mode,'collector_id',s.collector_id,'payment_id',s.payment_id)
  from private.transparent_submissions s join public.orders o on o.id=s.order_id
  where s.request_key=p_request_key and s.api_kind='orders';
$$;
revoke all on function public.service_orders_payment_context(uuid) from public,anon,authenticated;
grant execute on function public.service_orders_payment_context(uuid) to service_role;
commit;
