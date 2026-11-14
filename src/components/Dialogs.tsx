"use client";

import { motion } from "framer-motion";
import { Bell, Keyboard, Settings as SettingsIcon, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { getEngine } from "./audio";

function Modal({ title, icon, onClose, children }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass glass-strong w-full max-w-md rounded-3xl p-6"
        initial={{ y: 24, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="accent-text">{icon}</span>
          <h2 className="font-display text-2xl">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-white/75">{label}</span>
        <span className="text-white tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ["--val" as string]: (value - min) / (max - min) }}
    />
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2.5 text-sm text-white/75">
      {label}
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="relative h-6 w-11 rounded-full transition-colors"
        style={{ background: on ? "var(--accent)" : "rgba(255,255,255,0.15)" }}
      >
        <motion.span
          layout
          className="absolute top-1 h-4 w-4 rounded-full bg-white"
          style={{ left: on ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </label>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  const resetAll = useStore((st) => st.resetAll);
  const [confirm, setConfirm] = useState(false);

  return (
    <Modal title="Settings" icon={<SettingsIcon size={20} />} onClose={onClose}>
      <Row label="Focus" value={`${s.focusMin} min`}>
        <Range label="Focus length" value={s.focusMin} min={5} max={90} step={5} onChange={(v) => update({ focusMin: v })} />
      </Row>
      <Row label="Short break" value={`${s.shortMin} min`}>
        <Range label="Short break length" value={s.shortMin} min={1} max={30} onChange={(v) => update({ shortMin: v })} />
      </Row>
      <Row label="Long break" value={`${s.longMin} min`}>
        <Range label="Long break length" value={s.longMin} min={5} max={45} step={5} onChange={(v) => update({ longMin: v })} />
      </Row>
      <Row label="Long break after" value={`${s.longEvery} sessions`}>
        <Range label="Sessions before a long break" value={s.longEvery} min={2} max={8} onChange={(v) => update({ longEvery: v })} />
      </Row>
      <div className="my-2 h-px bg-white/10" />
      <Toggle label="Start breaks automatically" on={s.autoStartBreaks} onChange={(v) => update({ autoStartBreaks: v })} />
      <Toggle label="Start focus automatically after a break" on={s.autoStartFocus} onChange={(v) => update({ autoStartFocus: v })} />
      <Row label="Chime volume" value={`${Math.round(s.chimeVolume * 100)}`}>
        <div className="flex items-center gap-3">
          <Range label="Chime volume" value={s.chimeVolume} min={0} max={1} step={0.05} onChange={(v) => update({ chimeVolume: v })} />
          <button
            onClick={async () => {
              await getEngine().unlock();
              getEngine().chime(s.chimeVolume);
            }}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
          >
            <Bell size={12} /> Test
          </button>
        </div>
      </Row>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/55">
        <span>Everything is saved in this browser only.</span>
        <button
          onClick={() => {
            if (!confirm) return setConfirm(true);
            resetAll();
            onClose();
          }}
          onBlur={() => setConfirm(false)}
          className={`rounded-full px-3 py-1.5 ${confirm ? "bg-red-400/80 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
        >
          {confirm ? "Click again to erase" : "Reset all data"}
        </button>
      </div>
    </Modal>
  );
}

export const SHORTCUTS: [string, string][] = [
  ["Space", "Start or pause"],
  ["R", "Reset timer"],
  ["S", "Skip to next session"],
  ["T", "Tasks"],
  ["A", "Sounds"],
  ["B", "Scenes"],
  ["G", "Stats"],
  ["1 – 4", "Switch scene"],
  ["M", "Mute"],
  ["Z", "Zen mode"],
  ["F", "Full screen"],
  ["?", "This list"],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" icon={<Keyboard size={20} />} onClose={onClose}>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {SHORTCUTS.map(([k, label]) => (
          <li key={k} className="flex items-center justify-between gap-3 text-sm text-white/75">
            {label}
            <kbd className="rounded-md border border-white/15 bg-white/8 px-2 py-0.5 font-mono text-[11px] text-white">{k}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
