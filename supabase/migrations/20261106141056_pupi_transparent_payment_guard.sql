begin;
create function private.guard_transparent_payment_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.provider_payments where order_id=new.order_id and state<>'failed') then
    raise exception 'payment_in_progress';
  end if;
  return new;
end $$;
revoke all on function private.guard_transparent_payment_insert() from public,anon,authenticated,service_role;
create trigger guard_transparent_financial_state before insert on private.transparent_submissions for each row execute function private.guard_transparent_payment_insert();
create or replace function public.service_reject_transparent_payment(p_order_id uuid,p_request_key uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  perform id from public.orders where id=p_order_id for update;
  update private.transparent_submissions set state='failed',result=jsonb_build_object('status','failed')
    where order_id=p_order_id and request_key=p_request_key and state='started' and payment_id is null
    and not exists(select 1 from private.provider_payments where order_id=p_order_id and state<>'failed');
  return found;
end $$;
commit;
