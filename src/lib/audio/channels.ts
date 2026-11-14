export const CHANNELS = ["rain", "thunder", "wind", "fire", "waves", "cafe", "keys", "crickets", "brown"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_INFO: Record<Channel, { label: string; hint: string }> = {
  rain: { label: "Rain", hint: "Steady rain with drips on glass" },
  thunder: { label: "Thunder", hint: "Distant rolls, now and then" },
  wind: { label: "Wind", hint: "Gusts that rise and fall" },
  fire: { label: "Fireplace", hint: "Low roar and crackles" },
  waves: { label: "Waves", hint: "Slow surf on the shore" },
  cafe: { label: "Café", hint: "Murmur and the odd cup clink" },
  keys: { label: "Keyboard", hint: "Someone typing nearby" },
  crickets: { label: "Crickets", hint: "A warm summer night outside" },
  brown: { label: "Brown noise", hint: "Deep, even background noise" },
};

export type Mix = Record<Channel, number>;

export function emptyMix(): Mix {
  return Object.fromEntries(CHANNELS.map((c) => [c, 0])) as Mix;
}
