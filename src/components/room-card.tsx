import {
  Bath,
  BedDouble,
  Baby,
  CookingPot,
  Droplets,
  Laptop,
  Sofa,
  Thermometer,
  ChevronRight,
  Leaf,
  CircleCheck,
  CloudSun,
  Clock3,
} from "lucide-react";
import {
  display,
  isOnline,
  relativeTime,
  statusOf,
  STATUS_LABELS,
} from "@/lib/climate";
import { isOutdoor, roomTone } from "@/lib/room-presentation";
import type { Room } from "@/lib/types";
export function RoomIcon({ name, size = 23 }: { name: string; size?: number }) {
  const tone = roomTone(name);
  const Icon = {
    aqua: Bath,
    lavender: BedDouble,
    sand: CookingPot,
    rose: Baby,
    slate: Laptop,
    green: Leaf,
    blue: Sofa,
  }[tone];
  return <Icon size={size} strokeWidth={1.6} />;
}
export function StatusBadge({ room, now }: { room: Room; now: number }) {
  const status = statusOf(room, now);
  const outdoor = isOutdoor(room.room) && isOnline(room, now);
  const Icon = outdoor
    ? CloudSun
    : status === "comfortable"
      ? CircleCheck
      : status.includes("humidity")
        ? Droplets
        : ["warm", "cool"].includes(status)
          ? Thermometer
          : Clock3;
  return (
    <span className={`status status-${outdoor ? "outdoor" : status}`}>
      <Icon size={12} />
      <span>
        {outdoor
          ? "Outdoor"
          : status === "comfortable"
            ? "Optimal"
            : STATUS_LABELS[status]}
      </span>
    </span>
  );
}
export function RoomCard({
  room,
  now,
}: {
  room: Room;
  index?: number;
  now: number;
}) {
  const online = isOnline(room, now);
  const outdoor = isOutdoor(room.room);
  return (
    <a
      href={`/room/?id=${room.id}`}
      className={`room-card ${!online ? "room-stale" : ""} ${outdoor ? "room-outdoor" : ""}`}
      aria-label={`${room.room}, ${online ? "online" : STATUS_LABELS[statusOf(room, now)]}, view details`}
    >
      <div className="room-card-heading">
        <span className={`room-icon tone-${roomTone(room.room)}`}>
          <RoomIcon name={room.room} />
        </span>
        <div className="room-name-group">
          <h3>{room.room}</h3>
          <span className={`online-label ${online ? "is-online" : ""}`}>
            <i />
            {!room.active
              ? "Inactive"
              : online
                ? "Online"
                : room.latest
                  ? "Offline"
                  : "Awaiting reading"}
            {outdoor && " · Outside"}
          </span>
        </div>
        <ChevronRight size={18} className="room-arrow" />
      </div>
      <div className="room-readings">
        <p className="room-temperature">
          <span className="sr-only">Temperature </span>
          {display(room.latest?.temperature)}
          <span>°C</span>
        </p>
        <p className="room-humidity">
          <Droplets size={17} />
          <span className="sr-only">Humidity </span>
          {display(room.latest?.humidity, 0)}
          <span>%</span>
        </p>
      </div>
      <div className="room-bottom">
        <StatusBadge room={room} now={now} />
        {room.latest ? (
          <time
            dateTime={room.latest.created_at}
            title={new Date(room.latest.created_at).toLocaleString()}
          >
            {relativeTime(room.latest.created_at, now)}
          </time>
        ) : (
          <span>No reading yet</span>
        )}
      </div>
    </a>
  );
}
