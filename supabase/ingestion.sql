-- Standalone upgrade for an existing Atmos database. Apply once, after schema.sql.
-- Existing devices, readings, viewer policies, and history are preserved.
begin;
create schema if not exists private;
create table private.device_ingest_credentials (
  device_id uuid primary key references public.devices(id) on delete cascade,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_received_at timestamptz
);
alter table private.device_ingest_credentials enable row level security;
revoke all on private.device_ingest_credentials from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, update on private.device_ingest_credentials to service_role;

alter table public.sensor_readings add column ingest_request_id uuid;
create unique index readings_ingest_request on public.sensor_readings(device_id, ingest_request_id)
  where ingest_request_id is not null;

-- Called ONLY by the Edge Function's server client. Invoker permissions and
-- explicit EXECUTE grants prevent viewers from calling this privileged path.
create function public.ingest_reading(
  p_device_id uuid, p_key_hash text, p_temperature numeric,
  p_humidity numeric, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  credential private.device_ingest_credentials%rowtype;
  previous public.sensor_readings%rowtype;
  enabled boolean;
  received timestamptz;
  new_id bigint;
  wait_seconds integer;
begin
  -- One locked credential per device makes the rate limit atomic.
  select * into credential from private.device_ingest_credentials
    where device_id = p_device_id for update;
  if not found or p_key_hash is null or credential.key_hash <> p_key_hash
    or credential.revoked_at is not null then
    return jsonb_build_object('status',401,'error','Unauthorized');
  end if;
  select active into enabled from public.devices where id = p_device_id for share;
  if not found or not enabled then
    return jsonb_build_object('status',403,'error','Device is inactive');
  end if;
  if p_temperature is null or p_temperature not between -40 and 85
    or p_humidity is null or p_humidity not between 0 and 100
    or p_request_id is null then
    return jsonb_build_object('status',422,'error','Invalid reading');
  end if;
  select * into previous from public.sensor_readings
    where device_id = p_device_id and ingest_request_id = p_request_id;
  if found then
    if previous.temperature <> round(p_temperature,2) or previous.humidity <> round(p_humidity,2) then
      return jsonb_build_object('status',409,'error','Request ID already used with another reading');
    end if;
    return jsonb_build_object('status',200,'id',previous.id::text,
      'created_at',previous.created_at,'duplicate',true);
  end if;
  received := clock_timestamp();
  if credential.last_received_at > received - interval '30 seconds' then
    wait_seconds := greatest(1,ceil(extract(epoch from credential.last_received_at + interval '30 seconds' - received))::integer);
    return jsonb_build_object('status',429,'error','Too many readings','retry_after',wait_seconds);
  end if;
  insert into public.sensor_readings(device_id,temperature,humidity,created_at,ingest_request_id)
    values(p_device_id,p_temperature,p_humidity,received,p_request_id) returning id into new_id;
  update private.device_ingest_credentials set last_received_at = received where device_id = p_device_id;
  return jsonb_build_object('status',201,'id',new_id::text,'created_at',received,'duplicate',false);
end;
$$;
revoke all on function public.ingest_reading(uuid,text,numeric,numeric,uuid) from public, anon, authenticated;
grant execute on function public.ingest_reading(uuid,text,numeric,numeric,uuid) to service_role;
commit;
