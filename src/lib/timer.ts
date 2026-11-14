/**
 * Pomodoro timer as a pure state machine.
 *
 * The timer never counts down by decrementing a number every second. Instead,
 * a running timer stores the wall-clock time it will end at (`endsAt`) and the
 * remaining time is always derived from `endsAt - now`. That keeps it accurate
 * when the browser throttles background tabs, and lets it survive a page reload.
 */

export type Mode = "focus" | "short" | "long";
export type Status = "idle" | "running" | "paused";

export interface TimerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** A long break comes after this many completed focus sessions. */
  longEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export interface TimerState {
  mode: Mode;
  status: Status;
  /** Epoch ms the running session ends at. Only set while running. */
  endsAt: number | null;
  /** Remaining ms, used while idle or paused. */
  remainingMs: number;
  /** Focus sessions completed since the last long break. */
  focusCount: number;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
};

export const MODE_LABEL: Record<Mode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

export function durationMs(mode: Mode, s: TimerSettings): number {
  const min = mode === "focus" ? s.focusMin : mode === "short" ? s.shortMin : s.longMin;
  return Math.round(min * 60_000);
}

export function initialTimer(s: TimerSettings = DEFAULT_SETTINGS): TimerState {
  return { mode: "focus", status: "idle", endsAt: null, remainingMs: durationMs("focus", s), focusCount: 0 };
}

export function remaining(state: TimerState, now: number): number {
  if (state.status === "running" && state.endsAt !== null) {
    return Math.max(0, state.endsAt - now);
  }
  return state.remainingMs;
}

/** Fraction of the current session that has elapsed, 0..1. */
export function progress(state: TimerState, now: number, s: TimerSettings): number {
  const total = durationMs(state.mode, s);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remaining(state, now) / total));
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status === "running") return state;
  return { ...state, status: "running", endsAt: now + state.remainingMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== "running") return state;
  return { ...state, status: "paused", endsAt: null, remainingMs: remaining(state, now) };
}

export function toggle(state: TimerState, now: number): TimerState {
  return state.status === "running" ? pause(state, now) : start(state, now);
}

/** Back to the full length of the current mode, stopped. */
export function reset(state: TimerState, s: TimerSettings): TimerState {
  return { ...state, status: "idle", endsAt: null, remainingMs: durationMs(state.mode, s) };
}

/** Jump to a mode by hand (the mode tabs). */
export function switchMode(state: TimerState, mode: Mode, s: TimerSettings): TimerState {
  return { ...state, mode, status: "idle", endsAt: null, remainingMs: durationMs(mode, s) };
}

/** Which mode follows the one that just finished. */
export function nextMode(mode: Mode, focusCountAfter: number, s: TimerSettings): Mode {
  if (mode !== "focus") return "focus";
  return focusCountAfter > 0 && focusCountAfter % s.longEvery === 0 ? "long" : "short";
}

export interface Transition {
  state: TimerState;
  /** The mode that just finished, if the session completed (not skipped). */
  completed: Mode | null;
}

/**
 * Move to the next session. `completed` is true when the clock ran out, false
 * when the user pressed skip. Only completed focus sessions count toward the
 * long-break cycle and the stats.
 */
export function advance(state: TimerState, s: TimerSettings, now: number, completed: boolean): Transition {
  const finished = state.mode;
  let focusCount = state.focusCount;
  if (finished === "focus" && completed) focusCount += 1;
  const mode = nextMode(finished, focusCount, s);
  // The cycle dots stay full during the long break and clear once it ends.
  if (finished === "long") focusCount = 0;

  const autoStart = mode === "focus" ? s.autoStartFocus : s.autoStartBreaks;
  const fresh: TimerState = {
    mode,
    status: "idle",
    endsAt: null,
    remainingMs: durationMs(mode, s),
    focusCount,
  };
  return {
    state: completed && autoStart ? start(fresh, now) : fresh,
    completed: completed ? finished : null,
  };
}

/** Called on every animation frame / interval; completes the session when time is up. */
export function tick(state: TimerState, s: TimerSettings, now: number): Transition {
  if (state.status === "running" && state.endsAt !== null && now >= state.endsAt) {
    return advance(state, s, now, true);
  }
  return { state, completed: null };
}

/** When settings change, an idle timer picks up the new length immediately. */
export function applySettings(state: TimerState, s: TimerSettings): TimerState {
  if (state.status !== "idle") return state;
  return { ...state, remainingMs: durationMs(state.mode, s) };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
