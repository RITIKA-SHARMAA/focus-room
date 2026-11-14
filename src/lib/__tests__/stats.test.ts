import { describe, expect, it } from "vitest";
import { bestDay, dayKey, formatMinutes, lastDays, prune, streak, today, totalMinutes, type Session } from "../stats";

/** Local-time timestamp for a given day of Nov 2026 at `hour`. */
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).getTime();
const s = (day: number, minutes = 25, hour = 10): Session => ({ endedAt: at(day, hour), minutes });

describe("stats", () => {
  it("totals today's minutes and sessions", () => {
    const sessions = [s(13), s(14), s(14, 50, 22)];
    expect(today(sessions, at(14, 23))).toEqual({ minutes: 75, sessions: 2 });
  });

  it("counts consecutive days ending today", () => {
    expect(streak([s(12), s(13), s(14)], at(14, 20))).toBe(3);
  });

  it("keeps yesterday's streak alive before today's first session", () => {
    expect(streak([s(12), s(13)], at(14, 8))).toBe(2);
  });

  it("breaks the streak on a missed day", () => {
    expect(streak([s(10), s(11), s(13), s(14)], at(14))).toBe(2);
    expect(streak([s(10)], at(14))).toBe(0);
  });

  it("builds a 7-day series oldest first, including empty days", () => {
    const week = lastDays([s(14, 30), s(12, 25), s(12, 25)], at(14), 7);
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ key: dayKey(at(14)), minutes: 30, sessions: 1 });
    expect(week[4]).toMatchObject({ key: dayKey(at(12)), minutes: 50, sessions: 2 });
    expect(week[0].minutes).toBe(0);
    expect(week[6].label).toBe("Sat"); // 14 Nov 2026 is a Saturday
  });

  it("finds the best day and the all-time total", () => {
    const sessions = [s(10, 25), s(11, 25), s(11, 50), s(12, 25)];
    expect(bestDay(sessions)).toEqual({ key: dayKey(at(11)), minutes: 75 });
    expect(totalMinutes(sessions)).toBe(125);
    expect(bestDay([])).toBeNull();
  });

  it("prunes old sessions", () => {
    const now = at(14);
    const old = { endedAt: now - 200 * 86_400_000, minutes: 25 };
    expect(prune([old, s(14)], now)).toHaveLength(1);
  });

  it("formats minutes for display", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(95)).toBe("1h 35m");
  });
});
