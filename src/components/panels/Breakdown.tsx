"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { ERROR_MESSAGES, MAX_POMODOROS_PER_STEP, type BreakdownErrorCode, type Step } from "@/lib/breakdown";
import { useStore } from "@/lib/store";

const BUDGETS = [
  { label: "Any", value: undefined },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "3h", value: 180 },
  { label: "Half day", value: 240 },
] as const;

interface Draft extends Step {
  keep: boolean;
}

/**
 * The AI helper: describe a big task, get it back as small steps you can edit
 * before they become tasks. Nothing is added until you confirm.
 */
export function Breakdown({ onClose }: { onClose: () => void }) {
  const focusMin = useStore((s) => s.settings.focusMin);
  const addTasks = useStore((s) => s.addTasks);
  const [task, setTask] = useState("");
  const [budget, setBudget] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Draft[] | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (task.trim().length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setSteps(null);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim(), minutes: budget, focusMin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_MESSAGES[(data.error as BreakdownErrorCode) ?? "ai_failed"] ?? ERROR_MESSAGES.ai_failed);
        return;
      }
      setSteps((data.steps as Step[]).map((s) => ({ ...s, keep: true })));
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const update = (i: number, patch: Partial<Draft>) => setSteps((s) => s && s.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const kept = steps?.filter((s) => s.keep && s.title.trim()) ?? [];
  const total = kept.reduce((a, s) => a + s.pomodoros, 0);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div
        className="mb-4 rounded-2xl p-3.5"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, transparent), rgba(255,255,255,0.04))" }}
      >
        <div className="mb-2.5 flex items-center gap-2 text-sm">
          <Sparkles size={15} className="accent-text" />
          <span className="font-medium">Break a big task into steps</span>
          <button onClick={onClose} aria-label="Close AI helper" className="ml-auto text-white/50 hover:text-white">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={submit}>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            placeholder="e.g. Prepare for my DBMS exam on normalization and indexing"
            maxLength={200}
            rows={2}
            className="w-full resize-none rounded-xl bg-black/25 px-3 py-2.5 text-sm placeholder:text-white/35"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-white/50">Time I have</span>
            {BUDGETS.map((b) => (
              <button
                type="button"
                key={b.label}
                onClick={() => setBudget(b.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition ${budget === b.value ? "bg-white text-[#0b0d18]" : "bg-white/8 text-white/70 hover:bg-white/15"}`}
              >
                {b.label}
              </button>
            ))}
            <button
              type="submit"
              disabled={loading || task.trim().length < 3}
              className="ml-auto rounded-full px-3.5 py-1.5 text-xs font-medium text-[#0b0d18] disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              {loading ? "Planning…" : "Plan it"}
            </button>
          </div>
        </form>

        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 space-y-2"
              aria-live="polite"
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="shimmer h-9 rounded-xl" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-xs text-red-100">
            {error}
          </p>
        )}

        {steps && (
          <div className="mt-3">
            <ul className="space-y-1.5">
              {steps.map((s, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex items-center gap-2 rounded-xl bg-black/20 px-2 py-1.5 ${s.keep ? "" : "opacity-45"}`}
                >
                  <button
                    onClick={() => update(i, { keep: !s.keep })}
                    aria-label={s.keep ? "Leave this step out" : "Include this step"}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/30"
                    style={s.keep ? { background: "var(--accent)", borderColor: "transparent", color: "#0b0d18" } : undefined}
                  >
                    {s.keep && <Check size={12} strokeWidth={3} />}
                  </button>
                  <textarea
                    value={s.title}
                    rows={1}
                    onChange={(e) => update(i, { title: e.target.value.replace(/\n/g, " ") })}
                    aria-label={`Step ${i + 1}`}
                    className="min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-snug [field-sizing:content]"
                  />
                  <div className="flex shrink-0 items-center gap-0.5 text-[11px] text-white/70">
                    <button
                      onClick={() => update(i, { pomodoros: Math.max(1, s.pomodoros - 1) })}
                      aria-label="Fewer sessions"
                      className="rounded p-0.5 hover:bg-white/10"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center tabular-nums">{s.pomodoros}×</span>
                    <button
                      onClick={() => update(i, { pomodoros: Math.min(MAX_POMODOROS_PER_STEP, s.pomodoros + 1) })}
                      aria-label="More sessions"
                      className="rounded p-0.5 hover:bg-white/10"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-white/50">
                {total} sessions · about {Math.round((total * focusMin) / 6) / 10}h of focus
              </span>
              <button onClick={() => setSteps(null)} className="ml-auto rounded-full px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
                Discard
              </button>
              <button
                disabled={kept.length === 0}
                onClick={() => {
                  addTasks(kept.map((s) => ({ title: s.title.trim(), estimate: s.pomodoros })));
                  setSteps(null);
                  setTask("");
                  onClose();
                }}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-[#0b0d18] disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                Add {kept.length} task{kept.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
