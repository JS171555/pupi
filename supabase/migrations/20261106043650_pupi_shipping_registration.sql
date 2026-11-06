begin;
-- Registro de intenção persistente evita repetir uma requisição externa incerta.
create table private.shipping_registrations (
  order_id uuid primary key references public.orders(id) on delete restrict,
  attempt_key uuid not null unique,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  status text not null check (status in ('started','rejected','registered','cancelled')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('registered','cancelled'))=(external_id is not null))
);
create index shipping_registrations_actor_idx on private.shipping_registrations(actor_id);
alter table private.shipping_registrations enable row level security;
revoke all on private.shipping_registrations from public,anon,authenticated;
grant all on private.shipping_registrations to service_role;

create function private.shipping_registration_context(p_actor uuid,p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_actor is null or not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then raise insufficient_privilege using message='admin_required'; end if;
  select jsonb_build_object(
    'order',jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'subtotal_cents',o.subtotal_cents,'address_snapshot',o.address_snapshot,
      'items',(select jsonb_agg(to_jsonb(i) order by i.product_id) from public.order_items i where i.order_id=o.id)),
    'quote',jsonb_build_object('id',q.id,'carrier',q.carrier,'service_id',q.service_id,'snapshot',q.snapshot,'packages',q.packages),
    'invoice',jsonb_build_object('access_key',n.access_key),
    'recipient',jsonb_build_object('email',u.email,'phone',p.phone),
    'shipment',jsonb_build_object('id',s.id,'provider',s.provider,'status',s.status,'external_id',s.external_id)
  ) into result from public.orders o join public.shipments s on s.order_id=o.id
    join private.shipping_quotes q on q.order_id=o.id join private.order_invoices n on n.order_id=o.id
    join public.profiles p on p.id=o.user_id join auth.users u on u.id=o.user_id
    where o.id=p_order and o.status in ('confirmed','preparing') and s.provider='melhor_envio' and s.status='pending' and s.external_id is null and q.packages is not null;
  if result is null then raise invalid_parameter_value using message='shipment_prerequisites_missing'; end if;
  return result;
end $$;
revoke all on function private.shipping_registration_context(uuid,uuid) from public,anon,authenticated;
grant execute on function private.shipping_registration_context(uuid,uuid) to service_role;
create function public.service_shipping_registration_context(p_actor uuid,p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.shipping_registration_context(p_actor,p_order); $$;
revoke all on function public.service_shipping_registration_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_shipping_registration_context(uuid,uuid) to service_role;

create function public.service_shipping_registration_begin(p_actor uuid,p_order uuid,p_attempt uuid,p_context jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare previous private.shipping_registrations%rowtype;
begin
  if p_attempt is null then raise invalid_parameter_value; end if;
  if p_actor is null or not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then raise insufficient_privilege using message='admin_required'; end if;
  perform id from public.orders where id=p_order for update;
  select * into previous from private.shipping_registrations where order_id=p_order for update;
  if found and previous.status in ('started','registered') then return previous.status; end if;
  if p_context is distinct from private.shipping_registration_context(p_actor,p_order) then raise serialization_failure using message='shipment_context_changed'; end if;
  insert into private.shipping_registrations(order_id,attempt_key,actor_id,status)
    values(p_order,p_attempt,p_actor,'started')
    on conflict(order_id) do update set attempt_key=excluded.attempt_key,actor_id=excluded.actor_id,status='started',external_id=null,updated_at=now();
  return 'started_now';
end $$;
revoke all on function public.service_shipping_registration_begin(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_shipping_registration_begin(uuid,uuid,uuid,jsonb) to service_role;

create function public.service_shipping_registration_finish(p_order uuid,p_attempt uuid,p_external_id text,p_rejected boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare attempt private.shipping_registrations%rowtype;
begin
  select * into attempt from private.shipping_registrations where order_id=p_order and attempt_key=p_attempt for update;
  if not found then raise no_data_found; end if;
  if attempt.status='registered' and attempt.external_id=p_external_id then return 'registered'; end if;
  if attempt.status<>'started' then raise invalid_parameter_value; end if;
  if p_rejected then
    if p_external_id is not null then raise invalid_parameter_value; end if;
    update private.shipping_registrations set status='rejected',updated_at=now() where order_id=p_order;
    return 'rejected';
  end if;
  if p_external_id is null or p_external_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise invalid_parameter_value; end if;
  update public.shipments set external_id=p_external_id where order_id=p_order and provider='melhor_envio' and status='pending' and external_id is null;
  if not found then raise serialization_failure using message='shipment_changed'; end if;
  update private.shipping_registrations set status='registered',external_id=p_external_id,updated_at=now() where order_id=p_order;
  return 'registered';
end $$;
revoke all on function public.service_shipping_registration_finish(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.service_shipping_registration_finish(uuid,uuid,text,boolean) to service_role;

-- Cancelamento e troca de chave ficam bloqueados enquanto uma etiqueta pode existir.
create function private.guard_shipping_registration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='orders' then
    if new.status is distinct from old.status and exists(select 1 from private.shipping_registrations where order_id=old.id and (status='started' or (status='registered' and new.status='cancelled'))) then
      raise exception 'shipment_registration_pending';
    end if;
  elsif tg_table_name='order_invoices' then
    if new.access_key is distinct from old.access_key and exists(select 1 from private.shipping_registrations where order_id=old.order_id and status in ('started','registered')) then
      raise exception 'shipment_registration_pending';
    end if;
  elsif tg_table_name='shipments' then
    if (new.status,new.carrier,new.service_name,new.tracking_code,new.provider) is distinct from (old.status,old.carrier,old.service_name,old.tracking_code,old.provider)
      and exists(select 1 from private.shipping_registrations where order_id=old.order_id and status='started') then
      raise exception 'shipment_registration_pending';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_shipping_registration() from public,anon,authenticated,service_role;
create trigger protect_order_shipping_registration before update on public.orders for each row execute function private.guard_shipping_registration();
create trigger protect_shipment_shipping_registration before update on public.shipments for each row execute function private.guard_shipping_registration();
create trigger protect_invoice_shipping_registration before update on private.order_invoices for each row execute function private.guard_shipping_registration();

-- O cancelamento autenticado da etiqueta libera a operação comercial para o administrador.
create function private.shipping_registration_cancelled() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status<>'cancelled' and new.status='cancelled' and new.provider='melhor_envio' then
    update private.shipping_registrations set status='cancelled',updated_at=now() where order_id=new.order_id and status='registered';
  end if;
  return new;
end $$;
revoke all on function private.shipping_registration_cancelled() from public,anon,authenticated,service_role;
create trigger record_shipping_registration_cancelled after update on public.shipments for each row execute function private.shipping_registration_cancelled();

create function private.admin_shipping_registration_status(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare attempt private.shipping_registrations%rowtype;
begin
  perform private.require_admin();
  select * into attempt from private.shipping_registrations where order_id=p_order;
  if not found then return null; end if;
  return jsonb_build_object('status',attempt.status,'external_id',attempt.external_id,'updated_at',attempt.updated_at);
end $$;
revoke all on function private.admin_shipping_registration_status(uuid) from public,anon,authenticated;
grant execute on function private.admin_shipping_registration_status(uuid) to authenticated;
create function public.admin_shipping_registration_status(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.admin_shipping_registration_status(p_order); $$;
revoke all on function public.admin_shipping_registration_status(uuid) from public,anon,authenticated;
grant execute on function public.admin_shipping_registration_status(uuid) to authenticated;
commit;
