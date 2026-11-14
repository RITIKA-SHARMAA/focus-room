"use client";

import { useEffect, useState } from "react";
import { SoundEngine } from "@/lib/audio/engine";
import { useStore } from "@/lib/store";

/** One engine for the whole app; created lazily in the browser. */
let engine: SoundEngine | null = null;
export function getEngine(): SoundEngine {
  if (!engine) engine = new SoundEngine();
  return engine;
}

/**
 * Keeps the sound engine in step with the store, and unlocks audio on the
 * first click or key press (browsers block sound until the user interacts).
 * Returns whether audio is running yet.
 */
export function useAudioSync(): { ready: boolean; unlock: () => Promise<void> } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const e = getEngine();
    const s = useStore.getState();
    e.setMix(s.mix);
    e.setMaster(s.masterVolume);
    e.setMuted(s.muted);
    return useStore.subscribe((st, prev) => {
      if (st.mix !== prev.mix) e.setMix(st.mix);
      if (st.masterVolume !== prev.masterVolume) e.setMaster(st.masterVolume);
      if (st.muted !== prev.muted) e.setMuted(st.muted);
    });
  }, []);

  useEffect(() => {
    const unlock = () => {
      getEngine()
        .unlock()
        .then(() => setReady(getEngine().state === "running"))
        .catch(() => setReady(false));
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return {
    ready,
    unlock: async () => {
      await getEngine().unlock();
      setReady(getEngine().state === "running");
    },
  };
}
