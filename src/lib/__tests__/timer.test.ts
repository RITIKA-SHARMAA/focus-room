import { describe, expect, it } from "vitest";
import * as T from "../timer";

const S: T.TimerSettings = { ...T.DEFAULT_SETTINGS, focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 };
const MIN = 60_000;

describe("timer state machine", () => {
  it("starts idle with a full focus session", () => {
    const t = T.initialTimer(S);
    expect(t.mode).toBe("focus");
    expect(t.status).toBe("idle");
    expect(T.remaining(t, 0)).toBe(25 * MIN);
  });

  it("derives remaining time from the end timestamp, not from ticks", () => {
    const t = T.start(T.initialTimer(S), 1_000);
    expect(t.endsAt).toBe(1_000 + 25 * MIN);
    expect(T.remaining(t, 1_000 + 10 * MIN)).toBe(15 * MIN);
    // A tab that was asleep for an hour still reports 0, never negative.
    expect(T.remaining(t, 1_000 + 60 * MIN)).toBe(0);
  });

  it("pause freezes the remaining time and resume continues from it", () => {
    let t = T.start(T.initialTimer(S), 0);
    t = T.pause(t, 5 * MIN);
    expect(t.status).toBe("paused");
    expect(T.remaining(t, 99 * MIN)).toBe(20 * MIN);
    t = T.start(t, 100 * MIN);
    expect(T.remaining(t, 101 * MIN)).toBe(19 * MIN);
  });

  it("toggle switches between running and paused", () => {
    let t = T.toggle(T.initialTimer(S), 0);
    expect(t.status).toBe("running");
    t = T.toggle(t, 1000);
    expect(t.status).toBe("paused");
  });

  it("completes a focus session on tick and moves to a short break", () => {
    const t = T.start(T.initialTimer(S), 0);
    expect(T.tick(t, S, 24 * MIN).completed).toBeNull();
    const res = T.tick(t, S, 25 * MIN);
    expect(res.completed).toBe("focus");
    expect(res.state.mode).toBe("short");
    expect(res.state.status).toBe("idle");
    expect(res.state.focusCount).toBe(1);
  });

  it("gives a long break after every Nth focus session, then resets the cycle", () => {
    let t = T.initialTimer(S);
    const modes: T.Mode[] = [];
    for (let i = 0; i < 8; i++) {
      t = T.advance(t, S, 0, true).state;
      modes.push(t.mode);
    }
    expect(modes).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
    expect(t.focusCount).toBe(0);
  });

  it("skipping a focus session does not count toward the cycle or stats", () => {
    const res = T.advance(T.initialTimer(S), S, 0, false);
    expect(res.completed).toBeNull();
    expect(res.state.mode).toBe("short");
    expect(res.state.focusCount).toBe(0);
  });

  it("auto-starts the next session only when the setting is on", () => {
    const auto = { ...S, autoStartBreaks: true };
    const t = T.start(T.initialTimer(auto), 0);
    const res = T.tick(t, auto, 25 * MIN);
    expect(res.state.status).toBe("running");
    expect(res.state.endsAt).toBe(25 * MIN + 5 * MIN);
  });

  it("applies new durations to an idle timer but not a running one", () => {
    const longer = { ...S, focusMin: 50 };
    expect(T.remaining(T.applySettings(T.initialTimer(S), longer), 0)).toBe(50 * MIN);
    const running = T.start(T.initialTimer(S), 0);
    expect(T.applySettings(running, longer)).toBe(running);
  });

  it("reports progress from 0 to 1", () => {
    const t = T.start(T.initialTimer(S), 0);
    expect(T.progress(t, 0, S)).toBe(0);
    expect(T.progress(t, 12.5 * MIN, S)).toBeCloseTo(0.5);
    expect(T.progress(t, 30 * MIN, S)).toBe(1);
  });

  it("formats the clock as mm:ss, rounding partial seconds up", () => {
    expect(T.formatClock(25 * MIN)).toBe("25:00");
    expect(T.formatClock(61_000)).toBe("01:01");
    expect(T.formatClock(500)).toBe("00:01");
    expect(T.formatClock(0)).toBe("00:00");
  });
});
