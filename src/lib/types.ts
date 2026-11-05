export type Device = {
  id: string;
  name: string;
  room: string;
  active: boolean;
  created_at: string;
};
export type SensorReading = {
  id: number;
  device_id: string;
  temperature: number;
  humidity: number;
  created_at: string;
};
export type Room = Device & { latest: SensorReading | null };
export type TimeRange = "24h" | "7d" | "30d";
export type ChartPoint = {
  created_at: string;
  temperature: number;
  humidity: number;
  reading_count: number;
};
export type RoomStatus =
  | "comfortable"
  | "high-humidity"
  | "low-humidity"
  | "warm"
  | "cool"
  | "offline"
  | "inactive"
  | "waiting";
export type Database = {
  public: {
    Tables: {
      devices: {
        Row: Device;
        Insert: Omit<Device, "id" | "created_at"> &
          Partial<Pick<Device, "id" | "created_at">>;
        Update: Partial<Device>;
        Relationships: [];
      };
      sensor_readings: {
        Row: SensorReading;
        Insert: Omit<SensorReading, "id" | "created_at"> & {
          created_at?: string;
        };
        Update: Partial<SensorReading>;
        Relationships: [
          {
            foreignKeyName: "sensor_readings_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      climate_history: {
        Args: { p_device_id?: string | null; p_window?: string };
        Returns: ChartPoint[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
