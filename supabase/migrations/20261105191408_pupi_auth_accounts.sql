begin;
alter table public.profiles add column terms_version text check (length(terms_version) between 1 and 80);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare accepted boolean;
begin
  accepted := coalesce(new.raw_user_meta_data->'terms_accepted' = 'true'::jsonb
    and new.raw_user_meta_data->>'terms_version' = 'testing-v1',false);
  insert into public.profiles(id,full_name,terms_accepted_at,terms_version)
  values(new.id,left(trim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','')),160),
    case when accepted then now() else null end,case when accepted then 'testing-v1' else null end);
  insert into public.user_roles(user_id,role) values(new.id,'customer');
  return new;
end $$;
revoke all on function private.handle_new_user() from public,anon,authenticated,service_role;

create function private.accept_test_notice() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege using message='Authentication required'; end if;
  update public.profiles set terms_accepted_at=coalesce(terms_accepted_at,now()),terms_version='testing-v1'
    where id=auth.uid();
  if not found then raise no_data_found using message='Profile not found'; end if;
end $$;
revoke all on function private.accept_test_notice() from public,anon,authenticated;
grant execute on function private.accept_test_notice() to authenticated;
create function public.accept_test_notice() returns void
language sql security invoker set search_path = '' as $$ select private.accept_test_notice(); $$;
revoke all on function public.accept_test_notice() from public,anon,authenticated;
grant execute on function public.accept_test_notice() to authenticated;

create function private.save_address(p_id uuid,p_data jsonb,p_expected_updated_at timestamptz)
returns public.addresses language plpgsql security definer set search_path = '' as $$
declare account_id uuid := auth.uid(); saved public.addresses; previous public.addresses;
begin
  if account_id is null then raise insufficient_privilege using message='Authentication required'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or exists(
    select 1 from jsonb_object_keys(p_data) as k(key) where key not in
      ('label','recipient','postal_code','street','number','complement','neighborhood','city','state','is_default')
  ) then raise invalid_parameter_value using message='Invalid address fields'; end if;
  -- Uma fila por titular para trocar o endereço padrão sem corrida ou perda de dados.
  perform id from public.profiles where id=account_id for update;
  if not found then raise insufficient_privilege using message='Profile required'; end if;
  if p_id is not null then
    select * into previous from public.addresses where id=p_id and user_id=account_id for update;
    if not found then raise no_data_found using message='Address not found'; end if;
    if p_expected_updated_at is null or previous.updated_at<>p_expected_updated_at then
      raise serialization_failure using message='Address changed';
    end if;
  end if;
  if coalesce((p_data->>'is_default')::boolean,false) then
    update public.addresses set is_default=false where user_id=account_id and is_default and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.addresses(user_id,label,recipient,postal_code,street,number,complement,neighborhood,city,state,is_default)
    values(account_id,trim(p_data->>'label'),trim(p_data->>'recipient'),p_data->>'postal_code',trim(p_data->>'street'),
      trim(p_data->>'number'),nullif(trim(p_data->>'complement'),''),trim(p_data->>'neighborhood'),trim(p_data->>'city'),
      p_data->>'state',coalesce((p_data->>'is_default')::boolean,false)) returning * into saved;
  else
    update public.addresses set label=trim(p_data->>'label'),recipient=trim(p_data->>'recipient'),postal_code=p_data->>'postal_code',
      street=trim(p_data->>'street'),number=trim(p_data->>'number'),complement=nullif(trim(p_data->>'complement'),''),
      neighborhood=trim(p_data->>'neighborhood'),city=trim(p_data->>'city'),state=p_data->>'state',
      is_default=coalesce((p_data->>'is_default')::boolean,false)
      where id=p_id and user_id=account_id returning * into saved;
  end if;
  return saved;
end $$;
revoke all on function private.save_address(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.save_address(uuid,jsonb,timestamptz) to authenticated;
create function public.save_address(p_id uuid,p_data jsonb,p_expected_updated_at timestamptz)
returns public.addresses language sql security invoker set search_path = '' as $$
  select private.save_address(p_id,p_data,p_expected_updated_at);
$$;
revoke all on function public.save_address(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_address(uuid,jsonb,timestamptz) to authenticated;

create function public.admin_access_status() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_admin(); $$;
revoke all on function public.admin_access_status() from public,anon,authenticated;
grant execute on function public.admin_access_status() to authenticated;

-- Bootstrap padrão da plataforma: o event trigger continua funcionando sem RPC pública.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
  end if;
end $$;
commit;
