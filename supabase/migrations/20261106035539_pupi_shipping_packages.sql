begin;
-- Preserva somente dimensões e peso retornados pelo provedor para o envio posterior.
alter table private.shipping_quotes add column packages jsonb
  check (packages is null or (jsonb_typeof(packages)='array' and jsonb_array_length(packages) between 1 and 20));
create function public.service_register_shipping_quote_v2(p_user_id uuid,p_address_id uuid,p_snapshot jsonb,
  p_shipping_cents integer,p_carrier text,p_service_name text,p_service_id text,p_expires_at timestamptz,p_packages jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare quote_id uuid; package jsonb; field text; amount numeric;
begin
  if p_packages is not null then
    if jsonb_typeof(p_packages)<>'array' or jsonb_array_length(p_packages) not between 1 and 20 then raise invalid_parameter_value using message='invalid_packages'; end if;
    for package in select value from jsonb_array_elements(p_packages) loop
      if jsonb_typeof(package)<>'object' then raise invalid_parameter_value using message='invalid_packages'; end if;
      foreach field in array array['height','width','length','weight'] loop
        if jsonb_typeof(package->field) is distinct from 'number' then raise invalid_parameter_value using message='invalid_packages'; end if;
        amount:=(package->>field)::numeric;
        if amount<=0 or amount>100000 then raise invalid_parameter_value using message='invalid_packages'; end if;
      end loop;
      if (select count(*) from jsonb_object_keys(package))<>4 then raise invalid_parameter_value using message='invalid_packages'; end if;
    end loop;
  end if;
  quote_id:=public.service_register_shipping_quote(p_user_id,p_address_id,p_snapshot,p_shipping_cents,p_carrier,p_service_name,p_service_id,p_expires_at);
  update private.shipping_quotes set packages=p_packages where id=quote_id;
  return quote_id;
end $$;
revoke all on function public.service_register_shipping_quote_v2(uuid,uuid,jsonb,integer,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.service_register_shipping_quote_v2(uuid,uuid,jsonb,integer,text,text,text,timestamptz,jsonb) to service_role;
commit;
