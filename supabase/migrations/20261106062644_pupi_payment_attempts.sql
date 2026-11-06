begin;
-- Uma intenção por pedido até existir reconciliação segura com o provedor.
create table private.payment_attempts (
  order_id uuid primary key references public.orders(id) on delete restrict,
  attempt_id uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  status text not null default 'started' check (status='started'),
  created_at timestamptz not null default now()
);
create index payment_attempts_user_idx on private.payment_attempts(user_id);
alter table private.payment_attempts enable row level security;
revoke all on private.payment_attempts from public,anon,authenticated;
grant all on private.payment_attempts to service_role;

-- Chamador confiável deve verificar a sessão e fornecer o ID do usuário autenticado.
create function public.service_begin_payment_attempt(p_user_id uuid,p_order_id uuid,p_attempt_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ord public.orders%rowtype; existing private.payment_attempts%rowtype; snap jsonb;
begin
  if p_user_id is null or p_order_id is null or p_attempt_id is null then raise invalid_parameter_value; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found or ord.user_id<>p_user_id then raise insufficient_privilege using message='order_not_owned'; end if;
  select * into existing from private.payment_attempts where order_id=p_order_id;
  if found then
    return jsonb_build_object('created',false,'attempt_id',existing.attempt_id,'status',existing.status,'snapshot',existing.snapshot);
  end if;
  if ord.status not in ('confirmed','preparing') or ord.payment_status<>'pending' or ord.stock_released_at is not null then
    raise invalid_parameter_value using message='order_not_payable';
  end if;
  select jsonb_build_object('order_id',ord.id,'order_number',ord.order_number,'currency',ord.currency,
    'subtotal_cents',ord.subtotal_cents,'shipping_cents',ord.shipping_cents,'total_cents',ord.total_cents,
    'items',coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.product_name,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents) order by i.product_id),'[]'::jsonb))
    into snap from public.order_items i where i.order_id=ord.id;
  if jsonb_array_length(snap->'items')=0 then raise invalid_parameter_value using message='order_without_items'; end if;
  insert into private.payment_attempts(order_id,attempt_id,user_id,snapshot) values(ord.id,p_attempt_id,p_user_id,snap);
  return jsonb_build_object('created',true,'attempt_id',p_attempt_id,'status','started','snapshot',snap);
end $$;
revoke all on function public.service_begin_payment_attempt(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_begin_payment_attempt(uuid,uuid,uuid) to service_role;

create function private.guard_payment_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if ((new.status='cancelled' and old.status<>'cancelled') or (new.stock_released_at is distinct from old.stock_released_at and new.stock_released_at is not null))
    and exists(select 1 from private.payment_attempts where order_id=old.id and status='started') then
    raise exception 'payment_attempt_pending';
  end if;
  return new;
end $$;
revoke all on function private.guard_payment_attempt() from public,anon,authenticated,service_role;
create trigger protect_pending_payment before update on public.orders for each row execute function private.guard_payment_attempt();
commit;
