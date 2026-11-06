begin;
alter table public.orders add column payment_environment text check(payment_environment in ('sandbox','production')),
  add column payment_review_required boolean not null default false;
grant select(payment_environment,payment_review_required) on public.orders to authenticated;
alter table private.transparent_submissions add column payload_version smallint not null default 1 check(payload_version in (1,2));
-- Identifica os pagamentos de teste já confirmados, preservando o estado financeiro.
update public.orders o set payment_review_required=(select count(*) filter(where p.state<>'failed')>1 or coalesce(bool_or(p.state='review'),false) from private.provider_payments p where p.order_id=o.id);
update public.orders o set payment_environment=(select s.provider_mode from private.transparent_submissions s
  where s.order_id=o.id and s.api_kind='orders' and s.payment_id is not null
  order by (s.state='paid') desc,s.created_at desc limit 1)
where exists(select 1 from private.transparent_submissions s where s.order_id=o.id and s.api_kind='orders' and s.payment_id is not null);
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
  return jsonb_build_object('order_id',ord.id,'order_number',ord.order_number,'total_cents',ord.total_cents,'order_status',ord.status,'payment_status',ord.payment_status,'payment_environment',ord.payment_environment,'payment_review_required',ord.payment_review_required,
    'submission',case when s.request_key is null then null else jsonb_build_object('request_key',s.request_key,'state',s.state,'result',s.result,'api_kind',s.api_kind,'created_at',s.created_at,'provider_mode',s.provider_mode,'collector_id',s.collector_id,'payload_version',s.payload_version) end);
end $$;
revoke all on function public.service_transparent_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_transparent_context(uuid,uuid) to service_role;

create or replace function public.service_begin_order_payment(p_user_id uuid,p_order_id uuid,p_request_key uuid,p_fingerprint text,p_mode text,p_collector_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s private.transparent_submissions%rowtype; result jsonb; fresh boolean;
begin
  if p_mode is null or p_mode not in ('sandbox','production') or p_collector_id is null or p_collector_id !~ '^[0-9]{1,30}$' then raise invalid_parameter_value; end if;
  perform id from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise insufficient_privilege; end if;
  if exists(select 1 from public.orders where id=p_order_id and payment_environment is not null and payment_environment<>p_mode) then raise exception 'payment_environment_changed'; end if;
  select * into s from private.transparent_submissions where request_key=p_request_key;
  fresh=not found;
  if not fresh and (s.api_kind<>'orders' or s.provider_mode<>p_mode or s.collector_id<>p_collector_id) then raise exception 'payment_configuration_changed'; end if;
  result=public.service_begin_transparent_payment(p_user_id,p_order_id,p_request_key,p_fingerprint);
  if fresh and (result->>'can_submit')::boolean then
    update private.transparent_submissions set api_kind='orders',provider_mode=p_mode,collector_id=p_collector_id,payload_version=2
      where request_key=p_request_key and order_id=p_order_id;
  end if;
  return result || jsonb_build_object('fresh',fresh);
end $$;
revoke all on function public.service_begin_order_payment(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.service_begin_order_payment(uuid,uuid,uuid,text,text,text) to service_role;


-- Uma única transação: não confirma o pedido sem salvar o vínculo e resultado sanitizado.
create function public.service_record_order_payment(p_request_key uuid,p_payment_id text,p_state text,p_updated_at timestamptz,p_total_cents bigint,p_result jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare s private.transparent_submissions%rowtype; target uuid; mode text; applied text; state text; result jsonb;
begin
  select order_id into target from private.transparent_submissions where request_key=p_request_key and api_kind='orders';
  if target is null then raise invalid_parameter_value; end if;
  select payment_environment into mode from public.orders where id=target for update;
  select * into s from private.transparent_submissions where request_key=p_request_key for update;
  if p_payment_id is null or p_payment_id !~ '^ORD[A-Z0-9]{10,60}$' or (mode is not null and mode<>s.provider_mode)
    or p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>350000
    or p_result->>'payment_id' is distinct from p_payment_id or p_result->>'status' is distinct from p_state
    or (p_result-array['payment_id','status','method','requires_action','qr_code','qr_code_base64','expires_at'])<>'{}'::jsonb then raise invalid_parameter_value; end if;
  applied=public.service_apply_provider_payment(target,p_payment_id,p_state,p_updated_at,p_total_cents);
  if applied='stale' then return applied; end if;
  state=case when applied='review' or (select count(*) filter(where p.state<>'failed')>1 or coalesce(bool_or(p.state='review'),false) from private.provider_payments p where p.order_id=target) then 'review' else p_state end;
  result=p_result||jsonb_build_object('status',state);
  if public.service_complete_transparent_payment(target,p_request_key,p_payment_id,state,p_updated_at,result) is not true then
    raise serialization_failure using message='payment_link_not_confirmed';
  end if;
  update public.orders set payment_environment=coalesce(payment_environment,s.provider_mode),
    payment_review_required=(select count(*) filter(where p.state<>'failed')>1 or coalesce(bool_or(p.state='review'),false) from private.provider_payments p where p.order_id=target) where id=target;
  return applied;
end $$;
revoke all on function public.service_record_order_payment(uuid,text,text,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.service_record_order_payment(uuid,text,text,timestamptz,bigint,jsonb) to service_role;

-- Mantém as extensões existentes do painel; ajusta apenas os totais financeiros e a listagem.
do $$ declare definition text; begin
  definition=pg_get_functiondef('private.admin_query(text,jsonb)'::regprocedure);
  if position('payment_status=''paid'' and status<>''cancelled''' in definition)=0 or position('o.status,o.payment_status,o.total_cents' in definition)=0 then raise exception 'admin_query_definition_changed'; end if;
  definition=replace(definition,'payment_status=''paid'' and status<>''cancelled''','payment_status=''paid'' and status<>''cancelled'' and payment_environment is distinct from ''sandbox'' and not payment_review_required');
  definition=replace(definition,'o.status,o.payment_status,o.total_cents','o.status,o.payment_status,o.payment_environment,o.payment_review_required,o.total_cents');
  execute definition;
end $$;
-- Recusas definitivas não mantêm o cancelamento/estoque presos indefinidamente.
create or replace function private.guard_payment_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if ((new.status='cancelled' and old.status<>'cancelled') or (new.stock_released_at is distinct from old.stock_released_at and new.stock_released_at is not null))
    and exists(select 1 from private.payment_attempts a where a.order_id=old.id and a.status in ('started','ready')
      and (a.checkout_kind='pro'
        or exists(select 1 from private.transparent_submissions s where s.order_id=old.id and s.state<>'failed')
        or exists(select 1 from private.provider_payments p where p.order_id=old.id and p.state<>'failed'))) then
    raise exception 'payment_attempt_pending';
  end if;
  return new;
end $$;
revoke all on function private.guard_payment_attempt() from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
