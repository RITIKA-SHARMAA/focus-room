"use client";

import { motion } from "framer-motion";
import { ChartColumn, Flame } from "lucide-react";
import { useMemo } from "react";
import { bestDay, formatMinutes, lastDays, streak, today, totalMinutes } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { Panel } from "./Panel";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] px-3.5 py-3">
      <div className="text-[11px] tracking-wide text-white/50 uppercase">{label}</div>
      <div className="font-display mt-0.5 text-3xl leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-white/45">{sub}</div>}
    </div>
  );
}

export function StatsPanel({ from, now }: { from: "left" | "bottom"; now: number }) {
  const sessions = useStore((s) => s.sessions);
  const close = useStore((s) => s.closePanel);

  // Recompute at most once a minute; `now` ticks faster than that.
  const minute = Math.floor(now / 60_000);
  const data = useMemo(() => {
    const t = minute * 60_000;
    return {
      today: today(sessions, t),
      streak: streak(sessions, t),
      week: lastDays(sessions, t, 7),
      total: totalMinutes(sessions),
      best: bestDay(sessions),
    };
  }, [sessions, minute]);

  const max = Math.max(25, ...data.week.map((d) => d.minutes));
  const todayKey = data.week[data.week.length - 1]?.key;

  return (
    <Panel title="Your focus" icon={<ChartColumn size={18} />} onClose={() => close("stats")} from={from}>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          label="Today"
          value={formatMinutes(data.today.minutes)}
          sub={`${data.today.sessions} session${data.today.sessions === 1 ? "" : "s"}`}
        />
        <div className="rounded-2xl bg-white/[0.06] px-3.5 py-3">
          <div className="text-[11px] tracking-wide text-white/50 uppercase">Streak</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <motion.span animate={data.streak > 0 ? { scale: [1, 1.15, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }}>
              <Flame
                size={22}
                className={data.streak > 0 ? "text-orange-300" : "text-white/30"}
                fill={data.streak > 0 ? "currentColor" : "none"}
              />
            </motion.span>
            <span className="font-display text-3xl leading-tight">{data.streak}</span>
          </div>
          <div className="text-[11px] text-white/45">day{data.streak === 1 ? "" : "s"} in a row</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs text-white/60">Last 7 days</span>
          <span className="text-[11px] text-white/40">minutes focused</span>
        </div>
        <div
          className="flex h-36 items-end gap-2"
          role="img"
          aria-label={data.week.map((d) => `${d.label} ${d.minutes} minutes`).join(", ")}
        >
          {data.week.map((d, i) => (
            <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[10px] text-white/0 transition group-hover:text-white/70 tabular-nums">{d.minutes}</span>
              <motion.div
                className="w-full rounded-lg"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(d.minutes > 0 ? 6 : 3, (d.minutes / max) * 100)}%` }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 140, damping: 18 }}
                style={{
                  background:
                    d.key === todayKey
                      ? "var(--accent)"
                      : d.minutes > 0
                        ? "color-mix(in srgb, var(--accent) 45%, rgba(255,255,255,0.15))"
                        : "rgba(255,255,255,0.08)",
                }}
              />
              <span className={`text-[10px] ${d.key === todayKey ? "text-white" : "text-white/45"}`}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Tile label="All time" value={formatMinutes(data.total)} />
        <Tile
          label="Best day"
          value={data.best ? formatMinutes(data.best.minutes) : "—"}
          sub={
            data.best
              ? new Date(data.best.key + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })
              : "No sessions yet"
          }
        />
      </div>
      {sessions.length === 0 && <p className="mt-4 text-xs text-white/45">Finish your first focus session and it shows up here.</p>}
    </Panel>
  );
}
