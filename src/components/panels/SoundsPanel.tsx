"use client";

import { motion } from "framer-motion";
import {
  AudioLines,
  CloudLightning,
  CloudRain,
  Coffee,
  Flame,
  Keyboard,
  Leaf,
  RotateCcw,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { CHANNELS, CHANNEL_INFO, emptyMix, type Channel } from "@/lib/audio/channels";
import { SCENES } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import { Panel } from "./Panel";

const ICONS: Record<Channel, LucideIcon> = {
  rain: CloudRain,
  thunder: CloudLightning,
  wind: Wind,
  fire: Flame,
  waves: Waves,
  cafe: Coffee,
  keys: Keyboard,
  crickets: Leaf,
  brown: AudioLines,
};

function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="slider"
      style={{ ["--val" as string]: value }}
    />
  );
}

export function SoundsPanel({ audioReady, onUnlock, from }: { audioReady: boolean; onUnlock: () => void; from: "left" | "bottom" }) {
  const mix = useStore((s) => s.mix);
  const master = useStore((s) => s.masterVolume);
  const muted = useStore((s) => s.muted);
  const sceneId = useStore((s) => s.sceneId);
  const setVolume = useStore((s) => s.setVolume);
  const setMix = useStore((s) => s.setMix);
  const setMaster = useStore((s) => s.setMaster);
  const toggleMute = useStore((s) => s.toggleMute);
  const close = useStore((s) => s.closePanel);

  const activeCount = CHANNELS.filter((c) => mix[c] > 0).length;

  return (
    <Panel
      title="Soundscape"
      icon={<AudioLines size={18} />}
      onClose={() => close("sounds")}
      from={from}
      actions={
        <button
          onClick={() => setMix({ ...emptyMix(), ...SCENES[sceneId].mix })}
          title={`Load the ${SCENES[sceneId].name} mix`}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
        >
          <RotateCcw size={12} /> Scene mix
        </button>
      }
    >
      {!audioReady && (
        <button
          onClick={onUnlock}
          className="mb-4 w-full rounded-2xl border border-dashed border-white/25 px-4 py-3 text-left text-sm text-white/80 hover:border-white/50"
        >
          <span className="font-medium text-white">Tap to turn on sound.</span> Browsers keep pages silent until you interact.
        </button>
      )}

      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-white/5 px-3.5 py-3">
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute (M)" : "Mute (M)"}
          title="Mute (M)"
          className="text-white/80 hover:text-white"
        >
          {muted || master === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <span className="w-14 text-xs text-white/60">Master</span>
        <Slider value={muted ? 0 : master} onChange={setMaster} label="Master volume" />
      </div>

      <ul className="space-y-1.5">
        {CHANNELS.map((ch) => {
          const Icon = ICONS[ch];
          const on = mix[ch] > 0;
          return (
            <li key={ch} className={`group rounded-2xl px-3 py-2.5 transition-colors ${on ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setVolume(ch, on ? 0 : 0.5)}
                  aria-pressed={on}
                  aria-label={`${on ? "Turn off" : "Turn on"} ${CHANNEL_INFO[ch].label}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors"
                  style={{
                    background: on ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "rgba(255,255,255,0.06)",
                    color: on ? "var(--accent)" : "rgba(255,255,255,0.6)",
                  }}
                >
                  <Icon size={17} />
                </motion.button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm">{CHANNEL_INFO[ch].label}</span>
                    <span className="text-[11px] text-white/40 tabular-nums">{Math.round(mix[ch] * 100)}</span>
                  </div>
                  <Slider value={mix[ch]} onChange={(v) => setVolume(ch, v)} label={`${CHANNEL_INFO[ch].label} volume`} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        {activeCount} of {CHANNELS.length} playing. Every sound is generated live in your browser with the Web Audio API, no audio files.
      </p>
    </Panel>
  );
}
