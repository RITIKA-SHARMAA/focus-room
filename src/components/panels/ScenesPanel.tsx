"use client";

import { motion } from "framer-motion";
import { Check, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { SCENES, SCENE_IDS } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import { Panel } from "./Panel";

export function ScenesPanel() {
  const sceneId = useStore((s) => s.sceneId);
  const setScene = useStore((s) => s.setScene);
  const close = useStore((s) => s.closePanel);
  const [withSound, setWithSound] = useState(true);

  return (
    <Panel
      title="Scenes"
      icon={<ImageIcon size={18} />}
      onClose={() => close("scenes")}
      from="bottom"
      actions={
        <label className="mr-1 flex cursor-pointer items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={withSound} onChange={(e) => setWithSound(e.target.checked)} className="accent-[var(--accent)]" />
          Change sounds too
        </label>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SCENE_IDS.map((id, i) => {
          const sc = SCENES[id];
          const selected = id === sceneId;
          return (
            <motion.button
              key={id}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setScene(id, withSound)}
              aria-pressed={selected}
              className="group relative overflow-hidden rounded-2xl text-left"
              style={{ boxShadow: selected ? `0 0 0 2px ${sc.accent}` : "0 0 0 1px rgba(255,255,255,0.1)" }}
            >
              <div className="relative h-24 md:h-28" style={{ background: `linear-gradient(to bottom, ${sc.sky.join(", ")})` }}>
                <span
                  className="absolute top-3 right-4 h-6 w-6 rounded-full opacity-80"
                  style={{ background: sc.accent, filter: "blur(10px)" }}
                />
                <svg
                  viewBox="0 0 200 60"
                  preserveAspectRatio="none"
                  className="absolute inset-x-0 bottom-0 h-1/2 w-full opacity-80"
                  aria-hidden
                >
                  <path
                    d={
                      [
                        "M0 40 L20 22 L40 30 L60 12 L80 28 L100 16 L120 30 L140 14 L170 32 L200 20 L200 60 L0 60Z",
                        "M0 50 Q50 30 100 44 T200 40 L200 60 L0 60Z",
                        "M0 60 L15 20 L30 60 M40 60 L58 10 L76 60 M120 60 L138 16 L156 60 M170 60 L185 26 L200 60Z",
                        "M0 48 L50 20 L90 40 L140 14 L200 42 L200 60 L0 60Z",
                      ][i]
                    }
                    fill="rgba(0,0,0,0.55)"
                  />
                </svg>
                {selected && (
                  <motion.span
                    layoutId="scene-check"
                    className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full text-[#0b0d18]"
                    style={{ background: sc.accent }}
                  >
                    <Check size={14} strokeWidth={3} />
                  </motion.span>
                )}
                <span className="absolute right-2 bottom-1.5 text-[10px] text-white/50">{i + 1}</span>
              </div>
              <div className="bg-black/30 px-3 py-2.5">
                <div className="text-sm font-medium">{sc.name}</div>
                <div className="truncate text-[11px] text-white/50">{sc.tagline}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </Panel>
  );
}
