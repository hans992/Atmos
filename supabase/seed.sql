-- Optional sample data. UUIDs belong only to this demo fixture.
-- Re-running the seed updates fixtures and adds only missing hourly samples.
begin;
insert into public.devices(id,name,room,active) values
('00000000-0000-4000-8000-000000000001','ESP32-C3-01','Living room',true),
('00000000-0000-4000-8000-000000000002','ESP32-C3-02','Bedroom',true),
('00000000-0000-4000-8000-000000000003','ESP32-C3-03','Kitchen',true),
('00000000-0000-4000-8000-000000000004','ESP32-C3-04','Home office',true),
('00000000-0000-4000-8000-000000000005','ESP32-C3-05','Bathroom',true),
('00000000-0000-4000-8000-000000000006','ESP32-C3-06','Nursery',true)
on conflict(id) do update set name=excluded.name,room=excluded.room,active=excluded.active;
with fixture(device_id,temperature,humidity,stale) as (values
('00000000-0000-4000-8000-000000000001'::uuid,22.4,46,0),
('00000000-0000-4000-8000-000000000002'::uuid,20.8,51,0),
('00000000-0000-4000-8000-000000000003'::uuid,23.2,48,0),
('00000000-0000-4000-8000-000000000004'::uuid,22.1,43,0),
('00000000-0000-4000-8000-000000000005'::uuid,23.6,68,0),
('00000000-0000-4000-8000-000000000006'::uuid,21.0,49,2))
insert into public.sensor_readings(device_id,temperature,humidity,created_at)
select f.device_id,
  round((f.temperature + sin(extract(epoch from ts)/14400)*0.9)::numeric,2),
  round((f.humidity + sin(extract(epoch from ts)/18000)*4)::numeric,2),ts
from fixture f cross join lateral generate_series(
  date_trunc('hour',now()) - interval '30 days',
  date_trunc('hour',now()) - make_interval(hours=>f.stale), interval '1 hour') ts
on conflict(device_id,created_at) do nothing;
-- Fresh current samples for five rooms; nursery intentionally demonstrates stale data.
insert into public.sensor_readings(device_id,temperature,humidity,created_at)
select id,case room when 'Living room' then 22.4 when 'Bedroom' then 20.8 when 'Kitchen' then 23.2 when 'Home office' then 22.1 else 23.6 end,
case room when 'Living room' then 46 when 'Bedroom' then 51 when 'Kitchen' then 48 when 'Home office' then 43 else 68 end,now()
from public.devices where id in (
'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005')
on conflict(device_id,created_at) do nothing;
commit;
