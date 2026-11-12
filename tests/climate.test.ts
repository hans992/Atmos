import { test } from "node:test";
import assert from "node:assert/strict";
import { demoRooms, demoHistory } from "../src/lib/demo";
import { statusOf, isOnline, mean, STALE_AFTER_MS } from "../src/lib/climate";
const now = Date.parse("2026-11-05T12:00:00Z");
test("online ends exactly ten minutes after the last reading", () => {
  const room = demoRooms(now)[0];
  const aged = (age: number) => ({ ...room, latest: { ...room.latest!, created_at: new Date(now - age).toISOString() } });
  assert.equal(STALE_AFTER_MS, 600000);
  assert.equal(isOnline(aged(599999), now), true);
  assert.equal(isOnline(aged(600000), now), false);
  assert.equal(statusOf(aged(600001), now), "offline");
});
test("status prioritizes unavailable data before comfort conditions", () => {
  const room = demoRooms(now)[0];
  assert.equal(statusOf({ ...room, active: false }, now), "inactive");
  assert.equal(statusOf({ ...room, latest: null }, now), "waiting");
  assert.equal(
    statusOf(
      {
        ...room,
        latest: {
          ...room.latest!,
          humidity: 99,
          created_at: new Date(now - STALE_AFTER_MS - 1).toISOString(),
        },
      },
      now,
    ),
    "offline",
  );
  assert.equal(
    statusOf({ ...room, latest: { ...room.latest!, humidity: 61 } }, now),
    "high-humidity",
  );
  assert.equal(
    statusOf({ ...room, latest: { ...room.latest!, humidity: 29 } }, now),
    "low-humidity",
  );
  assert.equal(
    statusOf({ ...room, latest: { ...room.latest!, temperature: 27 } }, now),
    "warm",
  );
  assert.equal(
    statusOf({ ...room, latest: { ...room.latest!, temperature: 17 } }, now),
    "cool",
  );
  assert.equal(
    statusOf(
      { ...room, latest: { ...room.latest!, temperature: 19, humidity: 40 } },
      now,
    ),
    "comfortable",
  );
  assert.equal(
    statusOf(
      { ...room, latest: { ...room.latest!, temperature: 23, humidity: 60 } },
      now,
    ),
    "comfortable",
  );
});
test("stale rooms are excluded from current household averages", () => {
  const rooms = demoRooms(now);
  const online = rooms.filter((r) => isOnline(r, now));
  assert.equal(online.length, 5);
  assert.equal(
    rooms.filter((r) => statusOf(r, now) === "comfortable").length,
    3,
  );
  assert.equal(mean([]), null);
  assert.equal(
    mean(online.map((r) => r.latest!.temperature)),
    22.419999999999998,
  );
});
test("demo windows span the selected range and do not invent readings for unknown devices", () => {
  for (const [range, hours] of [
    ["24h", 24],
    ["7d", 168],
    ["30d", 720],
  ] as const) {
    const points = demoHistory(range, null, now);
    assert.equal(
      Date.parse(points.at(-1)!.created_at) - Date.parse(points[0].created_at),
      hours * 3600000,
    );
    assert.ok(points.length <= 193);
  }
  assert.deepEqual(demoHistory("24h", "unknown", now), []);
  const nursery = demoRooms(now)[5];
  assert.ok(
    demoHistory("24h", nursery.id, now).every(
      (p) => Date.parse(p.created_at) <= now - 7200000,
    ),
  );
});
