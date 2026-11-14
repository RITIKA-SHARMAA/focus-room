"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, Plus, RotateCcw, SkipForward } from "lucide-react";
import { useStore } from "@/lib/store";
import { MODE_LABEL, formatClock, progress, remaining, type Mode } from "@/lib/timer";

const MODES: Mode[] = ["focus", "short", "long"];

/** One digit that rolls up when it changes. */
function Digit({ d }: { d: string }) {
  return (
    <span className="relative block w-[0.62em] overflow-hidden text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={d}
          className="inline-block"
          initial={{ y: "-60%", opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "60%", opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {d}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Ring({ value, running, size }: { value: number; running: boolean; size: number }) {
  const stroke = size > 260 ? 6 : 5;
  const r = size / 2 - stroke * 2;
  const c = 2 * Math.PI * r;
  const angle = value * 2 * Math.PI - Math.PI / 2;
  const hx = size / 2 + r * Math.cos(angle);
  const hy = size / 2 + r * Math.sin(angle);
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      {/* Tick marks, one per minute-ish */}
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2;
        const r1 = r - 14;
        const r2 = r - (i % 5 === 0 ? 22 : 17);
        return (
          <line
            key={i}
            x1={size / 2 + r1 * Math.cos(a)}
            y1={size / 2 + r1 * Math.sin(a)}
            x2={size / 2 + r2 * Math.cos(a)}
            y2={size / 2 + r2 * Math.sin(a)}
            stroke="white"
            strokeOpacity={i / 60 < value ? 0.5 : 0.12}
            strokeWidth={i % 5 === 0 ? 1.5 : 1}
          />
        );
      })}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.3s linear, stroke 1.2s", filter: "drop-shadow(0 0 8px var(--accent))" }}
      />
      {value > 0.001 && (
        <circle cx={hx} cy={hy} r={stroke * 1.4} fill="#fff" style={{ filter: "drop-shadow(0 0 6px var(--accent))" }}>
          {running && (
            <animate attributeName="r" values={`${stroke * 1.2};${stroke * 1.8};${stroke * 1.2}`} dur="2s" repeatCount="indefinite" />
          )}
        </circle>
      )}
    </svg>
  );
}

export function Timer({ now, compact, size }: { now: number; compact?: boolean; size: number }) {
  const timer = useStore((s) => s.timer);
  const settings = useStore((s) => s.settings);
  const tasks = useStore((s) => s.tasks);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const toggle = useStore((s) => s.timerToggle);
  const reset = useStore((s) => s.timerReset);
  const skip = useStore((s) => s.timerSkip);
  const setMode = useStore((s) => s.timerMode);
  const togglePanel = useStore((s) => s.togglePanel);

  const clock = formatClock(remaining(timer, now));
  const value = progress(timer, now, settings);
  const running = timer.status === "running";
  const active = tasks.find((t) => t.id === activeTaskId && !t.done);

  return (
    <div className="flex flex-col items-center gap-5 select-none">
      {!compact && (
        <div className="glass relative flex rounded-full p-1 text-sm" role="tablist" aria-label="Timer mode">
          {MODES.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={timer.mode === m}
              onClick={() => setMode(m)}
              className="relative rounded-full px-3.5 py-1.5 text-white/70 transition-colors hover:text-white aria-selected:text-white sm:px-4"
            >
              {timer.mode === m && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-full bg-white/14"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                />
              )}
              <span className="relative">{MODE_LABEL[m]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative" style={{ width: size, height: size }}>
        <div
          className={`absolute inset-6 rounded-full ${running ? "breathe" : "opacity-30"}`}
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%)" }}
        />
        <div className="glass absolute inset-3 rounded-full" />
        <Ring value={value} running={running} size={size} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] tracking-[0.3em] text-white/55 uppercase">{MODE_LABEL[timer.mode]}</span>
          <div
            className="font-display flex leading-none text-white"
            style={{ fontSize: size * 0.27, textShadow: "0 4px 30px rgba(0,0,0,0.4)" }}
            aria-live="off"
            aria-label={`${clock} remaining`}
          >
            {clock.split("").map((ch, i) =>
              ch === ":" ? (
                <span key={i} className={`block px-[0.02em] ${running ? "animate-pulse" : ""}`}>
                  :
                </span>
              ) : (
                <Digit key={i} d={ch} />
              ),
            )}
          </div>
          <div className="mt-2 flex gap-1.5" aria-label={`${timer.focusCount} of ${settings.longEvery} sessions before a long break`}>
            {Array.from({ length: settings.longEvery }, (_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full transition-colors duration-500"
                style={{ background: i < timer.focusCount ? "var(--accent)" : "rgba(255,255,255,0.2)" }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {!compact && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={reset}
            aria-label="Reset timer (R)"
            title="Reset (R)"
            className="glass grid h-11 w-11 place-items-center rounded-full text-white/80 hover:text-white"
          >
            <RotateCcw size={18} />
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggle}
          aria-label={running ? "Pause (Space)" : "Start (Space)"}
          title={running ? "Pause (Space)" : "Start (Space)"}
          className="grid h-16 w-16 place-items-center rounded-full text-[#0b0d18] shadow-[0_10px_40px_-8px_var(--accent)]"
          style={{ background: "var(--accent)", transition: "background 1.2s" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={running ? "pause" : "play"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {running ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="translate-x-0.5" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        {!compact && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={skip}
            aria-label="Skip to next session (S)"
            title="Skip (S)"
            className="glass grid h-11 w-11 place-items-center rounded-full text-white/80 hover:text-white"
          >
            <SkipForward size={18} />
          </motion.button>
        )}
      </div>

      {!compact && (
        <button
          onClick={() => togglePanel("tasks")}
          className="glass-soft group flex max-w-[min(88vw,420px)] items-center gap-2 rounded-full px-4 py-2 text-sm text-white/75 backdrop-blur-md transition hover:text-white"
        >
          {active ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
              <span className="text-white/50">Working on</span>
              <span className="truncate font-medium text-white">{active.title}</span>
              <span className="shrink-0 text-white/45 tabular-nums">
                {active.spent}/{active.estimate}
              </span>
            </>
          ) : (
            <>
              <Plus size={14} /> Pick a task to focus on
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** Compact timer shown at the top while a bottom sheet covers the middle of the screen. */
export function MiniTimer({ now }: { now: number }) {
  const timer = useStore((s) => s.timer);
  const settings = useStore((s) => s.settings);
  const toggle = useStore((s) => s.timerToggle);
  const value = progress(timer, now, settings);
  const running = timer.status === "running";
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <div className="glass flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-2">
      <svg width={42} height={42} aria-hidden>
        <circle cx={21} cy={21} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
        <circle
          cx={21}
          cy={21}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          transform="rotate(-90 21 21)"
          style={{ transition: "stroke-dashoffset .3s linear" }}
        />
      </svg>
      <div className="leading-none">
        <div className="text-[10px] tracking-[0.2em] text-white/50 uppercase">{MODE_LABEL[timer.mode]}</div>
        <div className="font-display text-3xl tabular-nums">{formatClock(remaining(timer, now))}</div>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={toggle}
        aria-label={running ? "Pause (Space)" : "Start (Space)"}
        className="ml-1 grid h-10 w-10 place-items-center rounded-full text-[#0b0d18]"
        style={{ background: "var(--accent)" }}
      >
        {running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
      </motion.button>
    </div>
  );
}
