begin;
-- Somente a função de servidor que validou a assinatura pode registrar eventos.
create function public.service_apply_shipping_event(p_external_id text,p_event text,p_digest text,p_occurred_at timestamptz,p_tracking text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare shipment public.shipments%rowtype; event_status text; description text; latest timestamptz; inserted uuid; next_status text;
begin
  if p_external_id is null or p_external_id !~ '^[0-9a-fA-F-]{36}$' or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
    or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes'
    or (p_tracking is not null and p_tracking !~ '^[a-zA-Z0-9._-]{1,120}$') then raise invalid_parameter_value; end if;
  select * into shipment from public.shipments where provider='melhor_envio' and external_id=p_external_id for update;
  if not found then return false; end if;
  case p_event
    when 'order.created' then event_status:='pending';description:='Melhor Envio: notificação de etiqueta criada.';
    when 'order.pending' then event_status:='pending';description:='Melhor Envio: notificação de etiqueta pendente.';
    when 'order.released' then event_status:='pending';description:='Melhor Envio: notificação de etiqueta paga.';
    when 'order.generated' then event_status:='pending';description:='Melhor Envio: notificação de etiqueta gerada.';
    when 'order.received' then event_status:='pending';description:='Melhor Envio: notificação de encomenda recebida no ponto de distribuição.';
    when 'order.posted' then event_status:='posted';description:='Melhor Envio: notificação de encomenda postada.';
    when 'order.delivered' then event_status:='delivered';description:='Melhor Envio: notificação de encomenda entregue.';
    when 'order.cancelled' then event_status:='cancelled';description:='Melhor Envio: notificação de etiqueta cancelada.';
    when 'order.undelivered' then event_status:='failed';description:='Melhor Envio: notificação de entrega não concluída.';
    when 'order.paused' then event_status:=shipment.status;description:='Melhor Envio: notificação de entrega pausada.';
    when 'order.suspended' then event_status:=shipment.status;description:='Melhor Envio: notificação de entrega suspensa.';
    else return true;
  end case;
  select max(occurred_at) into latest from public.shipment_events where shipment_id=shipment.id and provider_event_id like 'melhor-envio:%';
  insert into public.shipment_events(shipment_id,provider_event_id,status,description,occurred_at)
    values(shipment.id,'melhor-envio:'||p_digest,event_status,description,p_occurred_at)
    on conflict(shipment_id,provider_event_id) do nothing returning id into inserted;
  if inserted is null then return true; end if;
  if latest is null or p_occurred_at>=latest then
    next_status:=shipment.status;
    if event_status='posted' and shipment.status='pending' then next_status:='posted';
    elsif event_status='delivered' and shipment.status in ('pending','posted','in_transit','out_for_delivery','failed') then next_status:='delivered';
    elsif event_status='failed' and shipment.status not in ('delivered','cancelled') then next_status:='failed';
    elsif event_status='cancelled' and shipment.status='pending' then next_status:='cancelled'; end if;
    update public.shipments set status=next_status,tracking_code=coalesce(p_tracking,tracking_code) where id=shipment.id;
  end if;
  return true;
end $$;
revoke all on function public.service_apply_shipping_event(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.service_apply_shipping_event(text,text,text,timestamptz,text) to service_role;
commit;
