begin;

create table public.home_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  active boolean not null default false,
  mobile_path text,
  desktop_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_mobile_path check (mobile_path is null or mobile_path ~ ('^'||id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  constraint banner_desktop_path check (desktop_path is null or desktop_path ~ ('^'||id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  constraint banner_complete check (not active or (mobile_path is not null and desktop_path is not null))
);
create index home_banners_order_idx on public.home_banners(sort_order,id);
alter table public.home_banners enable row level security;
revoke all on public.home_banners from public,anon,authenticated;
grant select on public.home_banners to anon,authenticated;
grant all on public.home_banners to service_role;
create policy banners_read on public.home_banners for select to anon,authenticated
  using (active and mobile_path is not null and desktop_path is not null);
create policy banners_admin_read on public.home_banners for select to authenticated using ((select private.is_admin()));
create trigger touch_updated_at before update on public.home_banners for each row execute function private.touch_updated_at();
create trigger audit_change after insert or update or delete on public.home_banners for each row execute function private.record_audit();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('banner-images','banner-images',false,5242880,array['image/jpeg','image/png','image/webp']);
alter table private.media_cleanup_queue drop constraint media_cleanup_queue_bucket_check;
alter table private.media_cleanup_queue add constraint media_cleanup_queue_bucket_check
  check (bucket in ('product-images','category-images','banner-images'));

create or replace function private.media_is_linked(p_bucket text,p_path text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select (p_bucket='product-images' and exists(select 1 from public.product_images where storage_path=p_path))
    or (p_bucket='category-images' and exists(select 1 from public.categories where image_path=p_path))
    or (p_bucket='banner-images' and exists(select 1 from public.home_banners where mobile_path=p_path or desktop_path=p_path));
$$;

-- Only called inside the existing authorized, idempotent admin_mutate transaction.
create function private.mutate_banner(p_operation text,p_id uuid,p_data jsonb,p_expected timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare banner public.home_banners; previous text; incoming text; variant text; file record;
begin
  perform private.require_admin();
  -- Serializes publication limits, replacements and deletion across administrators.
  perform pg_advisory_xact_lock(hashtextextended('pupi-banners',0));
  if p_id is not null then
    select * into banner from public.home_banners where id=p_id for update;
    if not found then raise no_data_found; end if;
    if p_expected is null or banner.updated_at<>p_expected then raise serialization_failure; end if;
  elsif p_operation<>'banner_save' then raise invalid_parameter_value;
  end if;
  if p_operation='banner_save' then
    if exists(select 1 from jsonb_object_keys(p_data) as k(key) where key not in ('title','sort_order','active'))
      or nullif(trim(p_data->>'title'),'') is null then raise invalid_parameter_value; end if;
    if coalesce((p_data->>'active')::boolean,false) and not coalesce(banner.active,false)
      and (select count(*) from public.home_banners where active)>=8 then raise exception 'banner_limit'; end if;
    if p_id is null then
      insert into public.home_banners(title,sort_order,active)
        values(trim(p_data->>'title'),coalesce((p_data->>'sort_order')::integer,0),coalesce((p_data->>'active')::boolean,false)) returning * into banner;
    else
      if (p_data->>'active')::boolean and (banner.mobile_path is null or banner.desktop_path is null) then raise exception 'banner_images_required'; end if;
      update public.home_banners set title=trim(p_data->>'title'),sort_order=(p_data->>'sort_order')::integer,
        active=(p_data->>'active')::boolean where id=p_id returning * into banner;
    end if;
  elsif p_operation='banner_image' then
    if exists(select 1 from jsonb_object_keys(p_data) as k(key) where key not in ('variant','path')) then raise invalid_parameter_value; end if;
    variant:=p_data->>'variant'; incoming:=p_data->>'path';
    if variant not in ('mobile','desktop') or variant is null or incoming is null
      or incoming !~ ('^'||p_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise invalid_parameter_value; end if;
    perform pg_advisory_xact_lock(hashtextextended('pupi-media:banner-images:'||incoming,0));
    if exists(select 1 from private.media_cleanup_queue where bucket='banner-images' and path=incoming) then raise exception 'media_removal_pending'; end if;
    if not exists(select 1 from storage.objects where bucket_id='banner-images' and name=incoming) then raise exception 'media_not_uploaded'; end if;
    previous:=case when variant='mobile' then banner.mobile_path else banner.desktop_path end;
    update public.home_banners set mobile_path=case when variant='mobile' then incoming else mobile_path end,
      desktop_path=case when variant='desktop' then incoming else desktop_path end where id=p_id returning * into banner;
    if previous is distinct from incoming and not private.media_is_linked('banner-images',previous) then
      perform private.queue_media_cleanup('banner-images',previous);
    end if;
  elsif p_operation='banner_remove' then
    delete from public.home_banners where id=p_id;
    perform private.queue_media_cleanup('banner-images',banner.mobile_path);
    perform private.queue_media_cleanup('banner-images',banner.desktop_path);
    for file in select name from storage.objects where bucket_id='banner-images'
      and name ~ ('^'||p_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') loop
      perform private.queue_media_cleanup('banner-images',file.name);
    end loop;
    return jsonb_build_object('id',p_id);
  else raise invalid_parameter_value;
  end if;
  return to_jsonb(banner);
end $$;
revoke all on function private.mutate_banner(text,uuid,jsonb,timestamptz) from public,anon,authenticated;

-- Extend the canonical RPCs without copying or replacing their existing workflows.
do $$ declare definition text; marker text; begin
  definition:=pg_get_functiondef('private.admin_mutate(text,uuid,jsonb,timestamptz,uuid)'::regprocedure);
  marker:='  when ''product_save'' then';
  if position(marker in definition)=0 then raise exception 'admin_mutate_definition_changed'; end if;
  definition:=replace(definition,marker,E'  when ''banner_save'',''banner_image'',''banner_remove'' then\n    result:=private.mutate_banner(p_operation,p_id,p_data,p_expected);\n'||marker);
  execute definition;
  definition:=pg_get_functiondef('private.admin_query(text,jsonb)'::regprocedure);
  marker:='  when ''dashboard'' then';
  if position(marker in definition)=0 then raise exception 'admin_query_definition_changed'; end if;
  definition:=replace(definition,marker,E'  when ''banners'' then\n    select count(*) into total from public.home_banners where search='''' or position(lower(search) in lower(title))>0;\n    select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) into items from (select * from public.home_banners where search='''' or position(lower(search) in lower(title))>0 order by sort_order,id limit page_size offset start_at) t;\n  when ''banner'' then\n    select to_jsonb(b) into item from public.home_banners b where id=entity_id; return item;\n'||marker);
  definition:=replace(definition,'''bucket'' not in (''product-images'',''category-images'')','''bucket'' not in (''product-images'',''category-images'',''banner-images'')');
  execute definition;
end $$;

create function private.banner_file_removable(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_admin()
    and exists(select 1 from private.media_cleanup_queue where bucket='banner-images' and path=p_path)
    and not private.media_is_linked('banner-images',p_path);
$$;
revoke all on function private.banner_file_removable(text) from public,anon,authenticated;
grant execute on function private.banner_file_removable(text) to authenticated;
create policy pupi_banner_read on storage.objects for select to anon,authenticated using (
  bucket_id='banner-images' and exists(select 1 from public.home_banners b
    where b.active and b.mobile_path is not null and b.desktop_path is not null
      and (b.mobile_path=storage.objects.name or b.desktop_path=storage.objects.name))
);
create policy pupi_banner_admin_read on storage.objects for select to authenticated
  using (bucket_id='banner-images' and (select private.is_admin()));
create policy pupi_banner_admin_insert on storage.objects for insert to authenticated with check (
  bucket_id='banner-images' and (select private.is_admin()) and exists(select 1 from public.home_banners b
    where storage.objects.name ~ ('^'||b.id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create policy pupi_banner_admin_delete on storage.objects for delete to authenticated
  using (bucket_id='banner-images' and private.banner_file_removable(name));
commit;
