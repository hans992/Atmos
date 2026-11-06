"use client";
import { useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Droplets, Thermometer, RefreshCw } from "lucide-react";
import { useClimate } from "./climate-provider";
import { demoHistory } from "@/lib/demo";
import { fetchHistory } from "@/lib/data";
import { display, mean } from "@/lib/climate";
import type { ChartPoint, TimeRange } from "@/lib/types";
export function RangeFilter({
  range,
  onChange,
}: {
  range: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  return (
    <div className="range-control" aria-label="History range">
      {(["24h", "7d", "30d"] as const).map((r) => (
        <button
          key={r}
          aria-pressed={r === range}
          className={r === range ? "selected" : ""}
          onClick={() => onChange(r)}
        >
          {r === "24h" ? "24 hours" : r === "7d" ? "7 days" : "30 days"}
        </button>
      ))}
    </div>
  );
}
export function HistoryChart({
  deviceId = null,
  detail = false,
}: {
  deviceId?: string | null;
  detail?: boolean;
}) {
  const { demo, revision, session, refreshed } = useClimate();
  const [range, setRange] = useState<TimeRange>("24h");
  const [metric, setMetric] = useState<"temperature" | "humidity">(
    "temperature",
  );
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const gradient = useId().replace(/:/g, "");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPoints([]);
    if (demo) {
      setPoints(demoHistory(range, deviceId, Date.now()));
      setLoading(false);
      return;
    }
    if (!session) {
      setLoading(false);
      return;
    }
    fetchHistory(range, deviceId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPoints(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "History could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, deviceId, demo, session, revision, retry]);
  const unit = metric === "temperature" ? "°C" : "%";
  const color =
    metric === "temperature"
      ? "var(--chart-temperature)"
      : "var(--chart-humidity)";
  const values = points.map((p) => p[metric]);
  const chartData = points.map((p) => ({
    ...p,
    time: Date.parse(p.created_at),
  }));
  const timeLabel = (value: number) =>
    new Date(value).toLocaleString(
      undefined,
      range === "24h"
        ? { hour: "2-digit", minute: "2-digit" }
        : { month: "short", day: "numeric" },
    );
  function download() {
    const csv = [
      "timestamp,temperature_c,humidity_percent,reading_count",
      ...points.map(
        (p) =>
          `${p.created_at},${p.temperature},${p.humidity},${p.reading_count}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `atmos-${deviceId || "home"}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="panel history-panel" aria-label="Climate history">
      <div className="section-heading chart-heading">
        <div>
          <h2>{detail ? "Room history" : "Your home over time"}</h2>
          <p>
            {detail
              ? "A closer look at your room’s climate."
              : "A quieter view of the bigger picture."}
          </p>
        </div>
        <RangeFilter range={range} onChange={setRange} />
      </div>
      <div className="chart-toolbar">
        <div className="metric-tabs">
          <button
            className={metric === "temperature" ? "active" : ""}
            aria-pressed={metric === "temperature"}
            onClick={() => setMetric("temperature")}
          >
            <Thermometer size={15} />
            Temperature
          </button>
          <button
            className={metric === "humidity" ? "active" : ""}
            aria-pressed={metric === "humidity"}
            onClick={() => setMetric("humidity")}
          >
            <Droplets size={15} />
            Humidity
          </button>
        </div>
        <button
          className="icon-button export-button"
          title="Download chart data as CSV"
          aria-label="Download chart data as CSV"
          disabled={!points.length || loading}
          onClick={download}
        >
          <Download size={17} />
        </button>
      </div>
      <div className="chart-summary">
        <strong>
          {display(mean(values))}
          <span>{unit}</span>
        </strong>
        <span>average {detail ? "" : "across active rooms"}</span>
        <div className="chart-extremes">
          Low{" "}
          <b>
            {display(values.length ? Math.min(...values) : null)}
            {unit}
          </b>
          <span />
          High{" "}
          <b>
            {display(values.length ? Math.max(...values) : null)}
            {unit}
          </b>
        </div>
      </div>
      <div className="chart-canvas" aria-busy={loading}>
        {loading ? (
          <div className="chart-placeholder">
            <RefreshCw className="spin" size={20} />
            Loading history…
          </div>
        ) : error ? (
          <div className="chart-placeholder" role="alert">
            <p>{error}</p>
            <button className="button" onClick={() => setRetry((v) => v + 1)}>
              Retry history
            </button>
          </div>
        ) : !points.length ? (
          <div className="chart-placeholder">
            No readings in this time range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart
              data={chartData}
              margin={{ top: 12, right: 8, left: -20, bottom: 0 }}
              accessibilityLayer
            >
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <XAxis
                type="number"
                dataKey="time"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickFormatter={timeLabel}
                axisLine={false}
                tickLine={false}
                minTickGap={48}
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                dy={10}
              />
              <YAxis
                domain={
                  metric === "temperature"
                    ? ["dataMin - 1", "dataMax + 1"]
                    : ["dataMin - 3", "dataMax + 3"]
                }
                tickFormatter={(v: number) => `${v.toFixed(0)}${unit}`}
                axisLine={false}
                tickLine={false}
                tickCount={5}
                tick={{ fontSize: 12, fill: "var(--muted)" }}
              />
              <Tooltip
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                formatter={(v) => [
                  `${Number(v).toFixed(1)}${unit}`,
                  metric === "temperature" ? "Temperature" : "Humidity",
                ]}
                contentStyle={{
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  background: "var(--surface)",
                  fontSize: 13,
                  color: "var(--text)",
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#${gradient})`}
                isAnimationActive={false}
                activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--surface)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="chart-footnote">
        <span className="legend-dot" style={{ background: color }} />
        {demo
          ? "Sample data"
          : range === "24h"
            ? "15-minute averages"
            : range === "7d"
              ? "Hourly averages"
              : "6-hour averages"}
        <span>·</span>
        {refreshed
          ? "Times shown in your local timezone"
          : "Waiting for readings"}
      </div>
    </section>
  );
}
