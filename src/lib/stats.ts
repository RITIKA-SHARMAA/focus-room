/** Focus-session history and the numbers derived from it. All dates are local time. */

export interface Session {
  /** Epoch ms when the focus session finished. */
  endedAt: number;
  minutes: number;
  taskId?: string | null;
}

export interface DayBucket {
  key: string;
  /** Short weekday label, e.g. "Mon". */
  label: string;
  minutes: number;
  sessions: number;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Step back one calendar day. Uses setDate so DST changes don't skip or repeat a day. */
function previousDay(ts: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  return startOfDay(d.getTime());
}

function byDay(sessions: Session[]): Map<string, { minutes: number; sessions: number }> {
  const map = new Map<string, { minutes: number; sessions: number }>();
  for (const s of sessions) {
    const k = dayKey(s.endedAt);
    const cur = map.get(k) ?? { minutes: 0, sessions: 0 };
    cur.minutes += s.minutes;
    cur.sessions += 1;
    map.set(k, cur);
  }
  return map;
}

export function today(sessions: Session[], now: number): { minutes: number; sessions: number } {
  return byDay(sessions).get(dayKey(now)) ?? { minutes: 0, sessions: 0 };
}

/**
 * Consecutive days with at least one focus session. A streak is still alive if
 * today has no session yet but yesterday did, so it doesn't reset at midnight.
 */
export function streak(sessions: Session[], now: number): number {
  const days = byDay(sessions);
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = previousDay(cursor);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return count;
}

/** The last `n` days, oldest first, including today. */
export function lastDays(sessions: Session[], now: number, n = 7): DayBucket[] {
  const days = byDay(sessions);
  const out: DayBucket[] = [];
  let cursor = startOfDay(now);
  for (let i = 0; i < n; i++) {
    const k = dayKey(cursor);
    const v = days.get(k) ?? { minutes: 0, sessions: 0 };
    out.unshift({ key: k, label: WEEKDAYS[new Date(cursor).getDay()], ...v });
    cursor = previousDay(cursor);
  }
  return out;
}

export function totalMinutes(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.minutes, 0);
}

export function bestDay(sessions: Session[]): { key: string; minutes: number } | null {
  let best: { key: string; minutes: number } | null = null;
  for (const [key, v] of byDay(sessions)) {
    if (!best || v.minutes > best.minutes) best = { key, minutes: v.minutes };
  }
  return best;
}

/** Keep storage bounded: drop sessions older than `keepDays`. */
export function prune(sessions: Session[], now: number, keepDays = 120): Session[] {
  const cutoff = now - keepDays * DAY_MS;
  return sessions.filter((s) => s.endedAt >= cutoff);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
