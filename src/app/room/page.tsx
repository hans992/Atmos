import { Suspense } from "react";
import { RoomDetail } from "@/components/dashboard";
export const metadata = { title: "Room details" };
export default function Page() {
  return (
    <Suspense>
      <RoomDetail />
    </Suspense>
  );
}
