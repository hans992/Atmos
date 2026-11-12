-- Optional AI support only. Existing devices/readings and their RLS are unchanged.
-- Run once with the SQL editor before enabling CLIMATE_AI_ENABLED.
begin;
create schema if not exists atmos_private;
revoke all on schema atmos_private from public, anon, authenticated;
grant usage on schema atmos_private to service_role;

create table if not exists atmos_private.home_insight_cache (
  user_id uuid primary key,
  fingerprint text not null default '',
  choice jsonb,
  generated_at timestamptz,
  last_attempt timestamptz,
  lease uuid,
  locked_until timestamptz,
  budget_day date not null default (now() at time zone 'UTC')::date,
  attempts integer not null default 0
);
create table if not exists atmos_private.home_insight_budget (
  id boolean primary key default true check (id),
  budget_day date not null,
  attempts integer not null default 0
);
alter table atmos_private.home_insight_cache enable row level security;
alter table atmos_private.home_insight_budget enable row level security;
revoke all on atmos_private.home_insight_cache, atmos_private.home_insight_budget from public, anon, authenticated;
grant select, insert, update on atmos_private.home_insight_cache, atmos_private.home_insight_budget to service_role;

-- Invoker rights: only service_role has table privileges and bypasses RLS.
-- The single budget row serializes claims across Edge Function instances.
create or replace function public.reserve_home_insight(p_user uuid, p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c atmos_private.home_insight_cache%rowtype;
  b atmos_private.home_insight_budget%rowtype;
  t timestamptz := now();
  d date := (now() at time zone 'UTC')::date;
  token uuid;
begin
  if p_user is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid cache key'; end if;
  insert into atmos_private.home_insight_budget(id,budget_day) values(true,d) on conflict do nothing;
  select * into b from atmos_private.home_insight_budget where id=true for update;
  if b.budget_day <> d then
    update atmos_private.home_insight_budget set budget_day=d, attempts=0 where id=true;
    b.attempts := 0;
  end if;
  insert into atmos_private.home_insight_cache(user_id,budget_day) values(p_user,d) on conflict do nothing;
  select * into c from atmos_private.home_insight_cache where user_id=p_user for update;
  if c.fingerprint = p_fingerprint and c.choice is not null and c.generated_at > t - interval '1 hour' then
    return jsonb_build_object('cached',jsonb_build_object('choice',c.choice,'generatedAt',floor(extract(epoch from c.generated_at)*1000)));
  end if;
  if c.locked_until > t or c.last_attempt > t - interval '10 minutes' or b.attempts >= 100 or (c.budget_day=d and c.attempts>=24) then
    return '{}'::jsonb;
  end if;
  token := gen_random_uuid();
  update atmos_private.home_insight_cache set fingerprint=p_fingerprint, choice=null, generated_at=null,
    last_attempt=t, lease=token, locked_until=t+interval '30 seconds',
    budget_day=d, attempts=case when c.budget_day=d then c.attempts+1 else 1 end
    where user_id=p_user;
  update atmos_private.home_insight_budget set attempts=attempts+1 where id=true;
  return jsonb_build_object('lease',token);
end;
$$;

create or replace function public.complete_home_insight(p_user uuid, p_lease uuid, p_choice jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_choice is not null and (jsonb_typeof(p_choice) <> 'object' or not (p_choice ? 'insightId' and p_choice ? 'variant')) then
    raise exception 'Invalid insight';
  end if;
  update atmos_private.home_insight_cache
    set choice=p_choice, generated_at=case when p_choice is not null then now() else null end, lease=null, locked_until=null
    where user_id=p_user and lease=p_lease and locked_until > now();
end;
$$;
revoke all on function public.reserve_home_insight(uuid,text) from public, anon, authenticated;
revoke all on function public.complete_home_insight(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_home_insight(uuid,text) to service_role;
grant execute on function public.complete_home_insight(uuid,uuid,jsonb) to service_role;
commit;
