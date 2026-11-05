import {
  ArrowUpRight,
  Bath,
  BedDouble,
  Baby,
  CookingPot,
  Droplets,
  Laptop,
  Sofa,
  Thermometer,
  Clock3,
} from "lucide-react";
import {
  display,
  isOnline,
  relativeTime,
  statusOf,
  STATUS_LABELS,
} from "@/lib/climate";
import type { Room } from "@/lib/types";
export function RoomIcon({ name, size = 21 }: { name: string; size?: number }) {
  const Icon = /bath/i.test(name)
    ? Bath
    : /bed/i.test(name)
      ? BedDouble
      : /kitchen/i.test(name)
        ? CookingPot
        : /office/i.test(name)
          ? Laptop
          : /nursery|child/i.test(name)
            ? Baby
            : Sofa;
  return <Icon size={size} strokeWidth={1.65} />;
}
export function StatusBadge({ room, now }: { room: Room; now: number }) {
  const status = statusOf(room, now);
  return (
    <span className={`status status-${status}`}>
      <span />
      {STATUS_LABELS[status]}
    </span>
  );
}
export function RoomCard({
  room,
  index,
  now,
}: {
  room: Room;
  index: number;
  now: number;
}) {
  const online = isOnline(room, now);
  return (
    <a
      href={`/room/?id=${room.id}`}
      className={`room-card ${!online ? "room-stale" : ""}`}
      aria-label={`${room.room}, ${STATUS_LABELS[statusOf(room, now)]}, view details`}
    >
      <div className="card-top">
        <span className={`room-icon tint-${index % 6}`}>
          <RoomIcon name={room.room} />
        </span>
        <StatusBadge room={room} now={now} />
      </div>
      <div className="room-name-row">
        <h3>{room.room}</h3>
        <ArrowUpRight size={17} className="room-arrow" />
      </div>
      <p className="sensor-name">
        {room.name} <span>·</span> SHT31
      </p>
      <div className="room-readings">
        <div>
          <span className="metric-label">
            <Thermometer size={14} />
            Temperature
          </span>
          <p>
            {display(room.latest?.temperature)}
            <span>°C</span>
          </p>
        </div>
        <div>
          <span className="metric-label">
            <Droplets size={14} />
            Humidity
          </span>
          <p>
            {display(room.latest?.humidity, 0)}
            <span>%</span>
          </p>
        </div>
      </div>
      <div className="room-bottom">
        <span>
          <Clock3 size={12} />
          {room.latest ? (
            <time
              dateTime={room.latest.created_at}
              title={new Date(room.latest.created_at).toLocaleString()}
            >
              {relativeTime(room.latest.created_at, now)}
            </time>
          ) : (
            "Waiting for first reading"
          )}
        </span>
        <span
          className={`signal ${online ? "signal-on" : ""}`}
          aria-label={online ? "Sensor online" : "Sensor unavailable"}
        >
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </a>
  );
}
