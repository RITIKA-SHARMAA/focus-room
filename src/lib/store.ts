import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { emptyMix, type Channel, type Mix } from "./audio/channels";
import { SCENES, type SceneId } from "./scenes";
import { prune, type Session } from "./stats";
import * as T from "./timer";

/**
 * All app state lives in one Zustand store and is saved to localStorage, so a
 * refresh keeps your tasks, settings, history and even a running timer.
 * There is no account or database: everything stays in the visitor's browser.
 */

export interface Task {
  id: string;
  title: string;
  done: boolean;
  /** Estimated focus sessions. */
  estimate: number;
  /** Focus sessions completed while this task was active. */
  spent: number;
  createdAt: number;
}

export interface Settings extends T.TimerSettings {
  chimeVolume: number;
}

export type Panel = "sounds" | "tasks" | "scenes" | "stats";

interface State {
  sceneId: SceneId;
  mix: Mix;
  masterVolume: number;
  muted: boolean;
  settings: Settings;
  timer: T.TimerState;
  tasks: Task[];
  activeTaskId: string | null;
  sessions: Session[];
  seenIntro: boolean;

  // UI-only (not persisted)
  openPanels: Panel[];
  zen: boolean;

  setScene: (id: SceneId, loadMix?: boolean) => void;
  setVolume: (ch: Channel, v: number) => void;
  setMix: (mix: Mix) => void;
  setMaster: (v: number) => void;
  toggleMute: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  timerToggle: () => void;
  timerReset: () => void;
  timerSkip: () => void;
  timerMode: (m: T.Mode) => void;
  /** Returns the mode that just completed, if any. */
  timerTick: () => T.Mode | null;

  addTask: (title: string, estimate?: number) => string;
  addTasks: (items: { title: string; estimate: number }[]) => void;
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => void;
  removeTask: (id: string) => void;
  reorderTasks: (ids: string[]) => void;
  clearDone: () => void;
  setActiveTask: (id: string | null) => void;

  togglePanel: (p: Panel) => void;
  closePanel: (p: Panel) => void;
  setZen: (z: boolean) => void;
  dismissIntro: () => void;
  resetAll: () => void;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function mixFor(id: SceneId): Mix {
  return { ...emptyMix(), ...SCENES[id].mix };
}

const DEFAULT_SETTINGS: Settings = { ...T.DEFAULT_SETTINGS, chimeVolume: 0.6 };

const initial = () => ({
  sceneId: "rain" as SceneId,
  mix: mixFor("rain"),
  masterVolume: 0.8,
  muted: false,
  settings: DEFAULT_SETTINGS,
  timer: T.initialTimer(DEFAULT_SETTINGS),
  tasks: [] as Task[],
  activeTaskId: null as string | null,
  sessions: [] as Session[],
  seenIntro: false,
});

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Record a completed focus session against today's stats and the active task. */
      const recordFocus = () => {
        const { settings, activeTaskId, sessions, tasks } = get();
        const now = Date.now();
        set({
          sessions: prune([...sessions, { endedAt: now, minutes: settings.focusMin, taskId: activeTaskId }], now),
          tasks: activeTaskId ? tasks.map((t) => (t.id === activeTaskId ? { ...t, spent: t.spent + 1 } : t)) : tasks,
        });
      };

      return {
        ...initial(),
        openPanels: [],
        zen: false,

        setScene: (id, loadMix = true) => set(loadMix ? { sceneId: id, mix: mixFor(id) } : { sceneId: id }),
        setVolume: (ch, v) => set((s) => ({ mix: { ...s.mix, [ch]: v } })),
        setMix: (mix) => set({ mix }),
        setMaster: (v) => set({ masterVolume: v, muted: false }),
        toggleMute: () => set((s) => ({ muted: !s.muted })),
        updateSettings: (patch) =>
          set((s) => {
            const settings = { ...s.settings, ...patch };
            return { settings, timer: T.applySettings(s.timer, settings) };
          }),

        timerToggle: () => set((s) => ({ timer: T.toggle(s.timer, Date.now()) })),
        timerReset: () => set((s) => ({ timer: T.reset(s.timer, s.settings) })),
        timerSkip: () => set((s) => ({ timer: T.advance(s.timer, s.settings, Date.now(), false).state })),
        timerMode: (m) => set((s) => ({ timer: T.switchMode(s.timer, m, s.settings) })),
        timerTick: () => {
          const { timer, settings } = get();
          const res = T.tick(timer, settings, Date.now());
          if (res.state === timer) return null;
          set({ timer: res.state });
          if (res.completed === "focus") recordFocus();
          return res.completed;
        },

        addTask: (title, estimate = 1) => {
          const id = uid();
          set((s) => ({
            tasks: [...s.tasks, { id, title: title.trim(), done: false, estimate, spent: 0, createdAt: Date.now() }],
            activeTaskId: s.activeTaskId ?? id,
          }));
          return id;
        },
        addTasks: (items) =>
          set((s) => {
            const now = Date.now();
            const created = items.map((it, i) => ({
              id: uid(),
              title: it.title,
              done: false,
              estimate: it.estimate,
              spent: 0,
              createdAt: now + i,
            }));
            return { tasks: [...s.tasks, ...created], activeTaskId: s.activeTaskId ?? created[0]?.id ?? null };
          }),
        updateTask: (id, patch) =>
          set((s) => {
            const tasks = s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
            // Finishing the active task hands focus to the next open one.
            let activeTaskId = s.activeTaskId;
            if (patch.done && id === activeTaskId) activeTaskId = tasks.find((t) => !t.done)?.id ?? null;
            return { tasks, activeTaskId };
          }),
        removeTask: (id) =>
          set((s) => ({
            tasks: s.tasks.filter((t) => t.id !== id),
            activeTaskId: s.activeTaskId === id ? (s.tasks.find((t) => t.id !== id && !t.done)?.id ?? null) : s.activeTaskId,
          })),
        reorderTasks: (ids) =>
          set((s) => {
            const byId = new Map(s.tasks.map((t) => [t.id, t]));
            const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Task[];
            const rest = s.tasks.filter((t) => !ids.includes(t.id));
            return { tasks: [...ordered, ...rest] };
          }),
        clearDone: () => set((s) => ({ tasks: s.tasks.filter((t) => !t.done) })),
        setActiveTask: (id) => set({ activeTaskId: id }),

        togglePanel: (p) =>
          set((s) => ({ openPanels: s.openPanels.includes(p) ? s.openPanels.filter((x) => x !== p) : [...s.openPanels, p] })),
        closePanel: (p) => set((s) => ({ openPanels: s.openPanels.filter((x) => x !== p) })),
        setZen: (zen) => set({ zen }),
        dismissIntro: () => set({ seenIntro: true }),
        resetAll: () => set({ ...initial(), seenIntro: true }),
      };
    },
    {
      name: "focus-room",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sceneId: s.sceneId,
        mix: s.mix,
        masterVolume: s.masterVolume,
        muted: s.muted,
        settings: s.settings,
        timer: s.timer,
        tasks: s.tasks,
        activeTaskId: s.activeTaskId,
        sessions: s.sessions,
        seenIntro: s.seenIntro,
      }),
      // Fill in any keys added in later versions so old saves keep working.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          mix: { ...emptyMix(), ...(p.mix ?? current.mix) },
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        };
      },
    },
  ),
);
