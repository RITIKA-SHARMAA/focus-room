"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /** Direction the panel slides in from. */
  from: "left" | "right" | "bottom";
  className?: string;
}

const OFFSET = { left: { x: -40, y: 0 }, right: { x: 40, y: 0 }, bottom: { x: 0, y: 40 } };

export function Panel({ title, icon, onClose, children, actions, from, className = "" }: Props) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, ...OFFSET[from], scale: 0.98 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, ...OFFSET[from], scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className={`glass glass-strong pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-3xl ${className}`}
      aria-label={title}
    >
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="accent-text">{icon}</span>
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
    </motion.section>
  );
}
