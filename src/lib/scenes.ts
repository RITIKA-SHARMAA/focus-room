import type { Channel } from "./audio/channels";

export const SCENE_IDS = ["rain", "cafe", "forest", "snow"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export interface Scene {
  id: SceneId;
  name: string;
  tagline: string;
  /** UI accent colour for this scene. */
  accent: string;
  /** Sky gradient, top to bottom. Also used for scene thumbnails. */
  sky: string[];
  /** Soundscape loaded when you switch to this scene. */
  mix: Partial<Record<Channel, number>>;
  /** How strong a lightning flash looks here (0 indoors-ish, 1 outdoors). */
  flash: number;
}

export const SCENES: Record<SceneId, Scene> = {
  rain: {
    id: "rain",
    name: "Rainy Night",
    tagline: "City lights through a wet window",
    accent: "#8fb4ff",
    sky: ["#060a18", "#101d3b", "#22355f"],
    mix: { rain: 0.65, thunder: 0.4, brown: 0.15 },
    flash: 1,
  },
  cafe: {
    id: "cafe",
    name: "Café Corner",
    tagline: "Warm lamps, slow coffee",
    accent: "#ffb37a",
    sky: ["#140a07", "#2e1810", "#5a301c"],
    mix: { cafe: 0.6, keys: 0.25, rain: 0.2 },
    flash: 0.35,
  },
  forest: {
    id: "forest",
    name: "Firefly Forest",
    tagline: "Moonlight, pines and fireflies",
    accent: "#b8f27c",
    sky: ["#02080a", "#062019", "#0f3a2c"],
    mix: { crickets: 0.45, wind: 0.35, brown: 0.1 },
    flash: 0.8,
  },
  snow: {
    id: "snow",
    name: "Snow Cabin",
    tagline: "Dusk, snowfall and a fire inside",
    accent: "#c9b8ff",
    sky: ["#0b0e2c", "#2a2858", "#6a4878", "#c78a90"],
    mix: { fire: 0.55, wind: 0.4 },
    flash: 0.6,
  },
};

/** Small seeded random generator so procedural scenery is identical on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
