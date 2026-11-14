"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  ChartColumn,
  EyeOff,
  Image as ImageIcon,
  Keyboard,
  ListTodo,
  Maximize2,
  Minimize2,
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SCENES, SCENE_IDS } from "@/lib/scenes";
import { useStore, type Panel } from "@/lib/store";
import { MODE_LABEL, formatClock, remaining, type Mode } from "@/lib/timer";
import { getEngine, useAudioSync } from "./audio";
import { SettingsDialog, ShortcutsDialog } from "./Dialogs";
import { isTyping, useMediaQuery, useNow } from "./hooks";
import { ScenesPanel } from "./panels/ScenesPanel";
import { SoundsPanel } from "./panels/SoundsPanel";
import { StatsPanel } from "./panels/StatsPanel";
import { TasksPanel } from "./panels/TasksPanel";
import { Scene } from "./scene/Scene";
import { MiniTimer, Timer } from "./Timer";

const DOCK: { id: Panel; label: string; icon: LucideIcon; key: string }[] = [
  { id: "sounds", label: "Sounds", icon: AudioLines, key: "A" },
  { id: "tasks", label: "Tasks", icon: ListTodo, key: "T" },
  { id: "scenes", label: "Scenes", icon: ImageIcon, key: "B" },
  { id: "stats", label: "Stats", icon: ChartColumn, key: "G" },
];

const DONE_TOAST: Record<Mode, string> = {
  focus: "Focus session done. Time for a break.",
  short: "Break's over. Ready for the next one?",
  long: "Long break done. Fresh start.",
};

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
      <path
        d="M16 3 A13 13 0 0 1 28.4 20"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transition: "stroke 1.2s" }}
      />
      <circle cx="16" cy="16" r="3.2" fill="#fff" />
    </svg>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`glass grid h-10 w-10 place-items-center rounded-full transition-colors ${active ? "text-white" : "text-white/70 hover:text-white"}`}
    >
      {children}
    </motion.button>
  );
}

export default function FocusRoom() {
  const now = useNow(250);
  const { ready: audioReady, unlock } = useAudioSync();
  const wide = useMediaQuery("(min-width: 1280px)");
  const small = useMediaQuery("(max-width: 640px)");

  const sceneId = useStore((s) => s.sceneId);
  const timer = useStore((s) => s.timer);
  const openPanels = useStore((s) => s.openPanels);
  const zen = useStore((s) => s.zen);
  const muted = useStore((s) => s.muted);
  const seenIntro = useStore((s) => s.seenIntro);

  const [dialog, setDialog] = useState<"settings" | "shortcuts" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [zenHint, setZenHint] = useState(false);
  const zenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = SCENES[sceneId];

  // Scene accent drives the whole UI's colour.
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", scene.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", scene.sky[0]);
  }, [scene]);

  // Timer heartbeat: completes sessions, plays the chime, shows a toast.
  useEffect(() => {
    const beat = () => {
      const done = useStore.getState().timerTick();
      if (done) {
        getEngine().chime(useStore.getState().settings.chimeVolume);
        setToast(DONE_TOAST[done]);
      }
    };
    beat(); // a session that ended while the tab was closed completes right away
    const id = setInterval(beat, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // Countdown in the browser tab title.
  const clock = formatClock(remaining(timer, now));
  useEffect(() => {
    document.title = timer.status === "idle" ? "Focus Room" : `${clock} · ${MODE_LABEL[timer.mode]} — Focus Room`;
  }, [clock, timer.status, timer.mode]);

  // On small screens only one panel fits; wide screens can show several.
  const toggle = useCallback(
    (p: Panel) => {
      const s = useStore.getState();
      if (!wide && !s.openPanels.includes(p)) useStore.setState({ openPanels: [p] });
      else s.togglePanel(p);
    },
    [wide],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || dialog) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if (e.code === "Space") {
        e.preventDefault();
        s.timerToggle();
        s.dismissIntro();
      } else if (k === "r") s.timerReset();
      else if (k === "s") s.timerSkip();
      else if (k === "m") s.toggleMute();
      else if (k === "z") s.setZen(!s.zen);
      else if (k === "f") toggleFullscreen();
      else if (k === "t") toggle("tasks");
      else if (k === "a") toggle("sounds");
      else if (k === "b") toggle("scenes");
      else if (k === "g") toggle("stats");
      else if (e.key === "?") setDialog("shortcuts");
      else if (e.key === "Escape") {
        if (s.zen) s.setZen(false);
        else useStore.setState({ openPanels: [] });
      } else if (/^[1-4]$/.test(e.key)) s.setScene(SCENE_IDS[Number(e.key) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, toggle, toggleFullscreen]);

  // In zen mode, moving the mouse briefly shows how to get out.
  useEffect(() => {
    if (!zen) return;
    const move = () => {
      setZenHint(true);
      if (zenTimer.current) clearTimeout(zenTimer.current);
      zenTimer.current = setTimeout(() => setZenHint(false), 2200);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [zen]);

  const isOpen = (p: Panel) => openPanels.includes(p);
  const timerSize = small ? 264 : 320;
  // A sheet across the bottom leaves no room for the big timer, so it shrinks to a mini timer up top.
  const showIntro = !seenIntro && !zen && openPanels.length === 0;
  const anyBottomSheet = !zen && ((!wide && openPanels.length > 0) || (wide && openPanels.includes("scenes")));

  return (
    <main className="relative h-dvh w-full overflow-hidden font-sans text-white">
      <Scene id={sceneId} />

      {/* Top bar */}
      <AnimatePresence>
        {!zen && (
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-5"
          >
            <Logo />
            <div className="leading-tight">
              <h1 className="font-display text-xl sm:text-2xl">Focus Room</h1>
              <AnimatePresence mode="wait">
                <motion.p
                  key={sceneId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-[11px] text-white/55"
                >
                  {scene.name} · {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:contents">
                <IconButton label="Keyboard shortcuts (?)" onClick={() => setDialog("shortcuts")}>
                  <Keyboard size={17} />
                </IconButton>
                <IconButton label={fullscreen ? "Exit full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen}>
                  {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </IconButton>
              </span>
              <IconButton label="Zen mode (Z)" onClick={() => useStore.getState().setZen(true)}>
                <EyeOff size={17} />
              </IconButton>
              <IconButton label="Settings" onClick={() => setDialog("settings")}>
                <SettingsIcon size={17} />
              </IconButton>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Big centred timer, or a mini timer while a bottom sheet is open */}
      <AnimatePresence mode="popLayout" initial={false}>
        {anyBottomSheet ? (
          <motion.div
            key="mini"
            className="absolute inset-x-0 top-[72px] z-20 flex justify-center sm:top-[84px]"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <MiniTimer now={now} />
          </motion.div>
        ) : (
          <motion.div
            key="big"
            className="absolute inset-0 z-10 flex items-center justify-center pb-16"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: zen ? 0.92 : 1, scale: zen ? 1.08 : 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
          >
            <Timer now={now} compact={zen} size={timerSize} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side columns on wide screens */}
      {wide && !zen && (
        <>
          <div className="pointer-events-none absolute top-24 bottom-28 left-6 z-20 flex w-[340px] flex-col gap-3">
            <AnimatePresence>
              {isOpen("sounds") && (
                <div key="sounds" className="flex min-h-0 flex-1 basis-0 flex-col">
                  <SoundsPanel audioReady={audioReady} onUnlock={unlock} from="left" />
                </div>
              )}
              {isOpen("stats") && (
                <div key="stats" className="flex min-h-0 flex-1 basis-0 flex-col">
                  <StatsPanel from="left" now={now} />
                </div>
              )}
            </AnimatePresence>
          </div>
          <div className="pointer-events-none absolute top-24 right-6 bottom-28 z-20 flex w-[380px] flex-col">
            <AnimatePresence>{isOpen("tasks") && <TasksPanel key="tasks" from="right" />}</AnimatePresence>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 mx-auto flex w-[min(760px,calc(100%-820px))] min-w-[480px] flex-col">
            <AnimatePresence>{isOpen("scenes") && <ScenesPanel key="scenes" />}</AnimatePresence>
          </div>
        </>
      )}

      {/* Bottom sheet on smaller screens */}
      {!wide && !zen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[80px] z-20 flex max-h-[calc(100dvh-240px)] flex-col px-3 sm:bottom-[92px] sm:mx-auto sm:max-w-xl">
          <AnimatePresence mode="wait">
            {openPanels[0] === "sounds" && <SoundsPanel key="sounds" audioReady={audioReady} onUnlock={unlock} from="bottom" />}
            {openPanels[0] === "tasks" && <TasksPanel key="tasks" from="bottom" />}
            {openPanels[0] === "scenes" && <ScenesPanel key="scenes" />}
            {openPanels[0] === "stats" && <StatsPanel key="stats" from="bottom" now={now} />}
          </AnimatePresence>
        </div>
      )}

      {/* Dock */}
      <AnimatePresence>
        {!zen && (
          <motion.nav
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5 sm:bottom-6"
            aria-label="Panels"
          >
            {DOCK.map(({ id, label, icon: Icon, key }) => {
              const on = isOpen(id);
              return (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => toggle(id)}
                  aria-pressed={on}
                  title={`${label} (${key})`}
                  className={`relative flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm transition-colors sm:px-4 ${on ? "text-white" : "text-white/65 hover:text-white"}`}
                >
                  {on && <motion.span layoutId={`dock-${id}`} className="absolute inset-0 rounded-full bg-white/12" />}
                  <Icon size={17} className="relative" style={on ? { color: "var(--accent)" } : undefined} />
                  <span className="relative hidden sm:inline">{label}</span>
                </motion.button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-white/15" />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (!audioReady) void unlock();
                else useStore.getState().toggleMute();
              }}
              aria-label={muted ? "Unmute (M)" : "Mute (M)"}
              title="Mute (M)"
              className="relative grid h-10 w-10 place-items-center rounded-full text-white/70 hover:text-white"
            >
              {muted || !audioReady ? <VolumeX size={17} /> : <Volume2 size={17} />}
              {audioReady && !muted && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
              )}
            </motion.button>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Zen exit hint */}
      <AnimatePresence>
        {zen && zenHint && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => useStore.getState().setZen(false)}
            className="glass absolute bottom-8 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white/80"
          >
            Exit zen mode <kbd className="ml-1 font-mono text-xs text-white/50">Z</kbd>
          </motion.button>
        )}
      </AnimatePresence>

      {/* First-visit welcome */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.6 } }}
            exit={{ opacity: 0 }}
            className={
              wide
                ? "absolute bottom-6 left-6 z-30 w-[360px]"
                : "absolute inset-0 z-40 grid place-items-center bg-black/35 p-4 backdrop-blur-[2px]"
            }
          >
            <motion.div
              initial={{ y: 16, scale: 0.97 }}
              animate={{ y: 0, scale: 1, transition: { delay: 0.6, type: "spring", stiffness: 260, damping: 24 } }}
              exit={{ y: 16 }}
              className="glass glass-strong w-full max-w-sm rounded-2xl p-5"
            >
              <p className="font-display text-xl">Welcome in.</p>
              <p className="mt-1 text-sm leading-relaxed text-white/70">
                {wide ? (
                  <>
                    Press <kbd className="rounded border border-white/20 px-1 font-mono text-xs">Space</kbd> to start a focus session.
                  </>
                ) : (
                  "Start a 25-minute focus session whenever you're ready."
                )}{" "}
                Mix your own soundscape, switch scenes, and let <span className="accent-text">Break it down</span> turn a big task into
                steps.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    void unlock();
                    useStore.getState().dismissIntro();
                    useStore.getState().timerToggle();
                  }}
                  className="rounded-full px-4 py-1.5 text-sm font-medium text-[#0b0d18]"
                  style={{ background: "var(--accent)" }}
                >
                  Start focusing
                </button>
                <button
                  onClick={() => useStore.getState().dismissIntro()}
                  className="rounded-full px-3 py-1.5 text-sm text-white/65 hover:bg-white/10"
                >
                  Look around first
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session-complete toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass absolute top-20 left-1/2 z-40 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm whitespace-nowrap"
          >
            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dialog === "settings" && <SettingsDialog key="settings" onClose={() => setDialog(null)} />}
        {dialog === "shortcuts" && <ShortcutsDialog key="shortcuts" onClose={() => setDialog(null)} />}
      </AnimatePresence>
    </main>
  );
}
