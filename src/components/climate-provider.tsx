"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, getSupabase } from "@/lib/supabase";
import { demoRooms } from "@/lib/demo";
import { fetchRooms } from "@/lib/data";
import type { Room } from "@/lib/types";
type ClimateContext = {
  rooms: Room[];
  loading: boolean;
  error: string | null;
  demo: boolean;
  now: number;
  refreshed: number;
  revision: number;
  refresh: () => void;
  session: Session | null;
  authReady: boolean;
  connected: boolean;
};
const Context = createContext<ClimateContext | null>(null);
export function ClimateProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [refreshed, setRefreshed] = useState(0);
  const [revision, setRevision] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [connected, setConnected] = useState(true);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    setNow(Date.now());
    setConnected(navigator.onLine);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const poll = setInterval(refresh, 60000);
    const online = () => {
      setConnected(true);
      refresh();
    };
    const offline = () => setConnected(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const supabase = getSupabase();
    const sub = supabase?.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      setAuthReady(true);
      setRooms([]);
    });
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      sub?.data.subscription.unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    if (!authReady) return;
    const controller = new AbortController();
    if (!configured) {
      const timestamp = Date.now();
      setRooms(demoRooms(timestamp));
      setRefreshed(timestamp);
      setLoading(false);
      return;
    }
    if (!session) {
      setRooms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchRooms(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setRooms(data);
          setRefreshed(Date.now());
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "Unable to load readings.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, session, authReady]);
  return (
    <Context.Provider
      value={{
        rooms,
        loading,
        error,
        demo: !configured,
        now,
        refreshed,
        revision,
        refresh,
        session,
        authReady,
        connected,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useClimate() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing ClimateProvider");
  return context;
}
