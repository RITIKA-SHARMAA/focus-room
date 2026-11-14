"use client";

import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { Check, ChevronDown, GripVertical, ListTodo, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore, type Task } from "@/lib/store";
import { Breakdown } from "./Breakdown";
import { Panel } from "./Panel";

function Checkbox({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] border-white/40 transition-colors"
      style={done ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
    >
      <AnimatePresence>
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="text-[#0b0d18]">
            <Check size={12} strokeWidth={3.5} />
          </motion.span>
        )}
      </AnimatePresence>
      {done && (
        <motion.span
          className="absolute inset-0 rounded-full"
          initial={{ boxShadow: "0 0 0 0 var(--accent)", opacity: 1 }}
          animate={{ boxShadow: "0 0 0 10px var(--accent)", opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      )}
    </motion.button>
  );
}

function Estimate({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask);
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => update(task.id, { estimate: Math.max(1, task.estimate - 1) })}
        aria-label="Lower estimate"
        className="rounded p-0.5 text-white/0 group-hover:text-white/60 hover:bg-white/10"
      >
        <Minus size={11} />
      </button>
      <div className="flex gap-0.5" title={`${task.spent} of ${task.estimate} sessions done`}>
        {Array.from({ length: Math.max(task.estimate, task.spent) }, (_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: i < task.spent ? "var(--accent)" : "rgba(255,255,255,0.18)" }}
          />
        ))}
      </div>
      <button
        onClick={() => update(task.id, { estimate: Math.min(8, task.estimate + 1) })}
        aria-label="Raise estimate"
        className="rounded p-0.5 text-white/0 group-hover:text-white/60 hover:bg-white/10"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

function TaskRow({ task, active }: { task: Task; active: boolean }) {
  const controls = useDragControls();
  const update = useStore((s) => s.updateTask);
  const remove = useStore((s) => s.removeTask);
  const setActive = useStore((s) => s.setActiveTask);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const commit = () => {
    setEditing(false);
    if (draft.trim()) update(task.id, { title: draft.trim() });
    else setDraft(task.title);
  };

  return (
    <Reorder.Item
      value={task.id}
      dragListener={false}
      dragControls={controls}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      onClick={() => setActive(task.id)}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-2xl px-2.5 py-2.5 transition-colors ${active ? "bg-white/[0.1]" : "hover:bg-white/[0.05]"}`}
    >
      {active && (
        <motion.span
          layoutId="active-task"
          className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full"
          style={{ background: "var(--accent)" }}
        />
      )}
      <span
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none text-white/25 hover:text-white/60 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </span>
      <Checkbox done={false} onToggle={() => update(task.id, { done: true })} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-black/30 px-1.5 py-0.5 text-sm"
          />
        ) : (
          <p onDoubleClick={() => setEditing(true)} className="truncate text-sm" title="Double-click to rename">
            {task.title}
          </p>
        )}
      </div>
      <Estimate task={task} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          remove(task.id);
        }}
        aria-label={`Delete ${task.title}`}
        className="text-white/0 transition group-hover:text-white/45 hover:!text-red-300 focus:text-white/60"
      >
        <Trash2 size={14} />
      </button>
    </Reorder.Item>
  );
}

export function TasksPanel({ from }: { from: "right" | "bottom" }) {
  const tasks = useStore((s) => s.tasks);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const reorder = useStore((s) => s.reorderTasks);
  const clearDone = useStore((s) => s.clearDone);
  const close = useStore((s) => s.closePanel);
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(1);
  const [showAI, setShowAI] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const planned = open.reduce((a, t) => a + Math.max(0, t.estimate - t.spent), 0);

  return (
    <Panel
      title="Tasks"
      icon={<ListTodo size={18} />}
      onClose={() => close("tasks")}
      from={from}
      actions={
        !showAI && (
          <button
            onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs hover:bg-white/10"
            style={{ color: "var(--accent)" }}
          >
            <Sparkles size={13} /> Break it down
          </button>
        )
      }
    >
      <AnimatePresence initial={false}>{showAI && <Breakdown onClose={() => setShowAI(false)} />}</AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addTask(title, estimate);
          setTitle("");
          setEstimate(1);
        }}
        className="mb-3 flex items-center gap-2 rounded-2xl bg-white/[0.06] py-1.5 pr-1.5 pl-3.5"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          maxLength={120}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm placeholder:text-white/40"
          aria-label="New task"
        />
        <div className="flex items-center gap-0.5 text-[11px] text-white/60" title="Estimated focus sessions">
          <button
            type="button"
            onClick={() => setEstimate((n) => Math.max(1, n - 1))}
            aria-label="Fewer sessions"
            className="rounded p-1 hover:bg-white/10"
          >
            <Minus size={11} />
          </button>
          <span className="w-5 text-center tabular-nums">{estimate}×</span>
          <button
            type="button"
            onClick={() => setEstimate((n) => Math.min(8, n + 1))}
            aria-label="More sessions"
            className="rounded p-1 hover:bg-white/10"
          >
            <Plus size={11} />
          </button>
        </div>
        <button
          type="submit"
          disabled={!title.trim()}
          aria-label="Add task"
          className="grid h-8 w-8 place-items-center rounded-xl text-[#0b0d18] disabled:opacity-30"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={16} />
        </button>
      </form>

      {open.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/50">
          No tasks yet. Add one above, or let <span className="accent-text">Break it down</span> plan a big one for you.
        </div>
      ) : (
        <>
          <div className="mb-1.5 px-1 text-[11px] text-white/45">
            {open.length} open · {planned} session{planned === 1 ? "" : "s"} left · tap a task to focus on it
          </div>
          <Reorder.Group axis="y" values={open.map((t) => t.id)} onReorder={reorder} className="space-y-1">
            <AnimatePresence initial={false}>
              {open.map((t) => (
                <TaskRow key={t.id} task={t} active={t.id === activeTaskId} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        </>
      )}

      {done.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center px-1">
            <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1 text-xs text-white/55 hover:text-white">
              <motion.span animate={{ rotate: showDone ? 0 : -90 }}>
                <ChevronDown size={14} />
              </motion.span>
              Done ({done.length})
            </button>
            <button onClick={clearDone} className="ml-auto text-[11px] text-white/40 hover:text-white">
              Clear
            </button>
          </div>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-1 space-y-1 overflow-hidden"
              >
                {done.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 pl-8">
                    <Checkbox done onToggle={() => updateTask(t.id, { done: false })} />
                    <span className="truncate text-sm text-white/45 line-through">{t.title}</span>
                    <span className="ml-auto text-[11px] text-white/35 tabular-nums">{t.spent}×</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </Panel>
  );
}
