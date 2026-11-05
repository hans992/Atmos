-- Atmos: one private household per project. Apply once to a new schema.
begin;
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  room text not null check (length(trim(room)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.sensor_readings (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  temperature numeric(5,2) not null check (temperature between -40 and 125),
  humidity numeric(5,2) not null check (humidity between 0 and 100),
  created_at timestamptz not null default now(),
  unique (device_id, created_at)
);
create index readings_device_time on public.sensor_readings(device_id, created_at desc, id desc);
create index readings_time on public.sensor_readings(created_at desc);
alter table public.devices enable row level security;
alter table public.sensor_readings enable row level security;
revoke all on public.devices, public.sensor_readings from anon, authenticated;
grant select on public.devices, public.sensor_readings to authenticated;
grant all on public.devices, public.sensor_readings to service_role;
grant usage, select on sequence public.sensor_readings_id_seq to service_role;
-- Only an administrator can set this app_metadata claim. Never use user_metadata.
create policy climate_viewers_devices on public.devices for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'climate_viewer') = 'true');
create policy climate_viewers_readings on public.sensor_readings for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'climate_viewer') = 'true');

-- Aggregate in Postgres so a month of frequent samples cannot hit the REST row cap.
-- SECURITY INVOKER preserves the caller's RLS policies.
create function public.climate_history(p_device_id uuid default null, p_window text default '24h')
returns table(created_at timestamptz, temperature numeric, humidity numeric, reading_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare
  span interval;
  bucket interval;
begin
  case p_window
    when '24h' then span := interval '24 hours'; bucket := interval '15 minutes';
    when '7d' then span := interval '7 days'; bucket := interval '1 hour';
    when '30d' then span := interval '30 days'; bucket := interval '6 hours';
    else raise exception 'Unsupported time range' using errcode = '22023';
  end case;
  return query
    select date_bin(bucket, r.created_at, timestamptz '2000-01-01 00:00:00+00'),
      round(avg(r.temperature),2), round(avg(r.humidity),2), count(*)
    from public.sensor_readings r
    join public.devices d on d.id = r.device_id
    where r.created_at >= now() - span and r.created_at <= now()
      and (p_device_id is null or r.device_id = p_device_id)
      and (p_device_id is not null or d.active)
    group by 1 order by 1;
end;
$$;
revoke all on function public.climate_history(uuid,text) from public, anon;
grant execute on function public.climate_history(uuid,text) to authenticated, service_role;
commit;
