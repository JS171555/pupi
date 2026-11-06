begin;
-- Associação de chave informada por administrador; não emite nem consulta NF-e.
create function private.valid_nfe_access_key(p_key text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare i integer; weight integer:=2; total integer:=0; remainder integer; digit integer;
begin
  if p_key is null or p_key !~ '^[0-9]{44}$' or substring(p_key from 21 for 2)<>'55' then return false; end if;
  for i in reverse 43..1 loop
    total:=total+(substring(p_key from i for 1)::integer*weight);
    weight:=case when weight=9 then 2 else weight+1 end;
  end loop;
  remainder:=total%11;
  digit:=case when remainder in (0,1) then 0 else 11-remainder end;
  return digit=substring(p_key from 44 for 1)::integer;
end $$;
revoke all on function private.valid_nfe_access_key(text) from public,anon,authenticated;
grant execute on function private.valid_nfe_access_key(text) to service_role;

create table private.order_invoices (
  order_id uuid primary key references public.orders(id) on delete restrict,
  access_key text not null unique check (private.valid_nfe_access_key(access_key)),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_invoices_updated_by_idx on private.order_invoices(updated_by);
alter table private.order_invoices enable row level security;
revoke all on private.order_invoices from public,anon,authenticated;
grant all on private.order_invoices to service_role;

create function private.admin_invoice_get(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare invoice private.order_invoices%rowtype;
begin
  perform private.require_admin();
  select * into invoice from private.order_invoices where order_id=p_order_id;
  if not found then return null; end if;
  return jsonb_build_object('order_id',invoice.order_id,'access_key',invoice.access_key,'updated_at',invoice.updated_at);
end $$;
revoke all on function private.admin_invoice_get(uuid) from public,anon,authenticated;
grant execute on function private.admin_invoice_get(uuid) to authenticated;
create function public.admin_invoice_get(p_order_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.admin_invoice_get(p_order_id); $$;
revoke all on function public.admin_invoice_get(uuid) from public,anon,authenticated;
grant execute on function public.admin_invoice_get(uuid) to authenticated;

create function private.admin_invoice_save(p_order_id uuid,p_access_key text,p_expected timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invoice private.order_invoices%rowtype;
begin
  perform private.require_admin();
  if not private.valid_nfe_access_key(p_access_key) then raise invalid_parameter_value using message='invalid_nfe_key'; end if;
  perform id from public.orders where id=p_order_id for update;
  if not found then raise no_data_found using message='order_not_found'; end if;
  select * into invoice from private.order_invoices where order_id=p_order_id for update;
  if found then
    if invoice.access_key=p_access_key then return jsonb_build_object('order_id',invoice.order_id,'access_key',invoice.access_key,'updated_at',invoice.updated_at); end if;
    if p_expected is null or invoice.updated_at<>p_expected then raise serialization_failure using message='invoice_conflict'; end if;
    update private.order_invoices set access_key=p_access_key,updated_at=now(),updated_by=auth.uid() where order_id=p_order_id returning * into invoice;
  else
    if p_expected is not null then raise serialization_failure using message='invoice_conflict'; end if;
    insert into private.order_invoices(order_id,access_key,updated_by) values(p_order_id,p_access_key,auth.uid()) returning * into invoice;
  end if;
  return jsonb_build_object('order_id',invoice.order_id,'access_key',invoice.access_key,'updated_at',invoice.updated_at);
end $$;
revoke all on function private.admin_invoice_save(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function private.admin_invoice_save(uuid,text,timestamptz) to authenticated;
create function public.admin_invoice_save(p_order_id uuid,p_access_key text,p_expected timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.admin_invoice_save(p_order_id,p_access_key,p_expected); $$;
revoke all on function public.admin_invoice_save(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_invoice_save(uuid,text,timestamptz) to authenticated;
commit;
