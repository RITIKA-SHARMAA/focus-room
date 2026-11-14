"use client";

import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useCallback, useEffect } from "react";
import type { SceneId } from "@/lib/scenes";
import { getEngine } from "../audio";
import { SceneBackdrop } from "./SceneBackdrop";
import { SceneCanvas } from "./SceneCanvas";

/** Full-screen animated background: SVG scenery + canvas particles, crossfading between scenes. */
export function Scene({ id }: { id: SceneId }) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 40, damping: 18 });
  const my = useSpring(rawY, { stiffness: 40, damping: 18 });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [rawX, rawY]);

  const subscribeThunder = useCallback((cb: () => void) => getEngine().on(cb), []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={id}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <SceneBackdrop scene={id} mx={mx} my={my} />
          <SceneCanvas scene={id} subscribeThunder={subscribeThunder} />
        </motion.div>
      </AnimatePresence>
      {/* Vignette keeps the UI readable over any scene. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,0.55) 100%)" }}
      />
    </div>
  );
}
