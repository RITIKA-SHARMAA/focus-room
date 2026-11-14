/**
 * Every sound in Focus Room is generated live with the Web Audio API. There are
 * no audio files: each channel is a small graph of noise sources, filters and
 * gain envelopes.
 *
 * Event-style sounds (rain drips, fire crackles, typing, thunder) are placed on
 * the audio clock by a look-ahead scheduler. A timer wakes up every 100 ms and
 * books every event due in the next 1.5 s at an exact AudioContext time. That
 * keeps the rhythm steady even when the browser throttles timers in a
 * background tab to once a second.
 */
import { CHANNELS, type Channel, type Mix, emptyMix } from "./channels";

type Buffers = { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };

/** A recurring event on the audio clock. `fire` books one event and returns the gap to the next, in seconds. */
interface Stream {
  nextAt: number;
  fire: (time: number) => number;
}

interface ChannelNode {
  gain: GainNode;
  streams: Stream[];
  stop: () => void;
}

type Emit = (event: "thunder", atAudioTime: number) => void;

const LOOKAHEAD_S = 1.5;
const SCHEDULER_MS = 100;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Per-channel loudness so equal slider positions sound roughly equal. */
const CHANNEL_LEVEL: Record<Channel, number> = {
  rain: 0.9,
  thunder: 1,
  wind: 0.8,
  fire: 0.9,
  waves: 0.9,
  cafe: 0.8,
  keys: 0.7,
  crickets: 0.6,
  brown: 0.7,
};

function makeBuffers(ctx: AudioContext): Buffers {
  const len = Math.floor(ctx.sampleRate * 6);
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const br = brown.getChannelData(0);

  // Pink noise: Paul Kellet's filter. Brown noise: leaky integration of white.
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    br[i] = last * 3.5;
  }
  // Remove drift so the loop point doesn't click.
  for (const d of [p, br]) {
    const drift = d[len - 1] - d[0];
    for (let i = 0; i < len; i++) d[i] -= (drift * i) / (len - 1);
  }
  return { white, pink, brown };
}

function loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(ctx.currentTime, Math.random() * buffer.duration);
  return src;
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gainNode(ctx: AudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Slow oscillator wired into an AudioParam: param swings ±depth around its value. */
function lfo(ctx: AudioContext, param: AudioParam, hz: number, depth: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const amt = gainNode(ctx, depth);
  osc.connect(amt).connect(param);
  osc.start();
  return osc;
}

/** A one-shot noise burst, used for crackles and key clicks. */
function burst(
  ctx: AudioContext,
  buf: AudioBuffer,
  out: AudioNode,
  t: number,
  dur: number,
  level: number,
  f: { type: BiquadFilterType; freq: number; q?: number },
) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = filter(ctx, f.type, f.freq, f.q ?? 1);
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * (buf.duration - 1), dur + 0.05);
}

/** A short decaying sine, used for drips and cup clinks. */
function ping(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, level: number, endFreq?: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = gainNode(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

type Builder = (ctx: AudioContext, out: GainNode, b: Buffers, emit: Emit) => { streams: Stream[]; nodes: AudioScheduledSourceNode[] };

const BUILDERS: Record<Channel, Builder> = {
  rain(ctx, out, b) {
    const body = loop(ctx, b.pink);
    body
      .connect(filter(ctx, "highpass", 450))
      .connect(filter(ctx, "lowpass", 7000))
      .connect(gainNode(ctx, 0.7))
      .connect(out);

    const hiss = loop(ctx, b.white);
    const hissGain = gainNode(ctx, 0.08);
    hiss
      .connect(filter(ctx, "bandpass", 3200, 0.5))
      .connect(hissGain)
      .connect(out);
    const swell = lfo(ctx, hissGain.gain, 0.07, 0.04);

    const drips: Stream = {
      nextAt: ctx.currentTime + 0.2,
      fire: (t) => {
        const f = rand(1800, 4200);
        ping(ctx, out, t, f, rand(0.02, 0.05), rand(0.02, 0.07), f * 0.6);
        return rand(0.05, 0.25);
      },
    };
    return { streams: [drips], nodes: [body, hiss, swell] };
  },

  thunder(ctx, out, b, emit) {
    const rolls: Stream = {
      nextAt: ctx.currentTime + rand(3, 7),
      fire: (t) => {
        emit("thunder", t);
        const start = t + rand(0.15, 0.6); // light arrives before sound
        const src = ctx.createBufferSource();
        src.buffer = b.brown;
        const lp = filter(ctx, "lowpass", 380, 0.9);
        lp.frequency.setValueAtTime(380, start);
        lp.frequency.exponentialRampToValueAtTime(90, start + 5);
        const g = gainNode(ctx, 0);
        const peak = rand(0.7, 1.2);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + rand(0.3, 0.8));
        g.gain.exponentialRampToValueAtTime(0.0001, start + rand(4, 7));
        src.connect(lp).connect(g).connect(out);
        src.start(start, Math.random() * 2, 8);
        return rand(16, 40);
      },
    };
    return { streams: [rolls], nodes: [] };
  },

  wind(ctx, out, b) {
    const src = loop(ctx, b.white);
    const bp = filter(ctx, "bandpass", 520, 0.9);
    const g = gainNode(ctx, 0.55);
    src.connect(bp).connect(g).connect(out);
    const sweep = lfo(ctx, bp.frequency, 0.05, 280);
    const gust = lfo(ctx, g.gain, 0.11, 0.3);
    return { streams: [], nodes: [src, sweep, gust] };
  },

  fire(ctx, out, b) {
    const roar = loop(ctx, b.brown);
    roar
      .connect(filter(ctx, "lowpass", 420))
      .connect(gainNode(ctx, 0.55))
      .connect(out);
    const crackle: Stream = {
      nextAt: ctx.currentTime + 0.1,
      fire: (t) => {
        const pop = Math.random() < 0.08;
        burst(ctx, b.white, out, t, pop ? rand(0.03, 0.06) : rand(0.004, 0.02), pop ? rand(0.4, 0.7) : rand(0.05, 0.3), {
          type: "highpass",
          freq: rand(1200, 3200),
        });
        // Crackles come in clusters: mostly short gaps, sometimes a pause.
        return Math.random() < 0.15 ? rand(0.3, 0.9) : rand(0.02, 0.14);
      },
    };
    return { streams: [crackle], nodes: [roar] };
  },

  waves(ctx, out, b) {
    const src = loop(ctx, b.pink);
    const lp = filter(ctx, "lowpass", 600);
    const g = gainNode(ctx, 0.12);
    src.connect(lp).connect(g).connect(out);
    const surf: Stream = {
      nextAt: ctx.currentTime + 0.1,
      fire: (t) => {
        const up = rand(2, 3.2);
        const down = rand(3.5, 5.5);
        g.gain.setTargetAtTime(rand(0.7, 1), t, up / 3);
        g.gain.setTargetAtTime(0.12, t + up, down / 3);
        lp.frequency.setTargetAtTime(rand(1400, 2200), t, up / 3);
        lp.frequency.setTargetAtTime(500, t + up, down / 3);
        return up + down + rand(0, 1.5);
      },
    };
    return { streams: [surf], nodes: [src] };
  },

  cafe(ctx, out, b) {
    const nodes: AudioScheduledSourceNode[] = [];
    const room = loop(ctx, b.brown);
    room
      .connect(filter(ctx, "lowpass", 220))
      .connect(gainNode(ctx, 0.25))
      .connect(out);
    nodes.push(room);

    // Three voice-range bands whose loudness wanders like overlapping chatter.
    const bands = [380, 720, 1250].map((f) => {
      const src = loop(ctx, b.pink);
      const g = gainNode(ctx, 0.1);
      src
        .connect(filter(ctx, "bandpass", f, 2.2))
        .connect(g)
        .connect(out);
      nodes.push(src);
      return g;
    });
    const chatter: Stream = {
      nextAt: ctx.currentTime + 0.05,
      fire: (t) => {
        for (const g of bands) g.gain.setTargetAtTime(Math.random() < 0.3 ? 0.05 : rand(0.15, 0.5), t, 0.06);
        return rand(0.09, 0.18);
      },
    };
    const clinks: Stream = {
      nextAt: ctx.currentTime + rand(2, 5),
      fire: (t) => {
        const base = rand(2400, 3200);
        ping(ctx, out, t, base, 0.5, 0.05);
        ping(ctx, out, t, base * 1.51, 0.35, 0.025);
        if (Math.random() < 0.4) ping(ctx, out, t + rand(0.08, 0.2), base * 1.12, 0.4, 0.03);
        return rand(3, 9);
      },
    };
    return { streams: [chatter, clinks], nodes };
  },

  keys(ctx, out, b) {
    let left = 0;
    const typing: Stream = {
      nextAt: ctx.currentTime + 0.3,
      fire: (t) => {
        if (left <= 0) left = Math.floor(rand(6, 32)); // start a new burst of typing
        const space = Math.random() < 0.15;
        burst(ctx, b.white, out, t, rand(0.01, 0.018), rand(0.2, 0.35), {
          type: "bandpass",
          freq: space ? rand(1400, 1900) : rand(2600, 4600),
          q: 1.4,
        });
        ping(ctx, out, t, space ? 140 : rand(170, 230), 0.03, 0.08);
        left -= 1;
        return left <= 0 ? rand(0.6, 3) : rand(0.06, 0.17);
      },
    };
    return { streams: [typing], nodes: [] };
  },

  crickets(ctx, out) {
    // Two crickets at different pitches, each chirping in short pulse trains.
    const cricket = (pitch: number, offset: number): Stream => ({
      nextAt: ctx.currentTime + offset,
      fire: (t) => {
        const pulses = Math.floor(rand(3, 5));
        for (let i = 0; i < pulses; i++) ping(ctx, out, t + i * 0.045, pitch + rand(-40, 40), 0.03, 0.05);
        return rand(0.45, 1.3);
      },
    });
    return { streams: [cricket(4400, 0.2), cricket(5100, 0.7)], nodes: [] };
  },

  brown(ctx, out, b) {
    const src = loop(ctx, b.brown);
    src
      .connect(filter(ctx, "lowpass", 900))
      .connect(gainNode(ctx, 0.8))
      .connect(out);
    return { streams: [], nodes: [src] };
  },
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Buffers | null = null;
  private channels = new Map<Channel, ChannelNode>();
  private mix: Mix = emptyMix();
  private masterVolume = 0.8;
  private muted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: "thunder") => void>();

  get state(): AudioContextState | "uninitialized" {
    return this.ctx?.state ?? "uninitialized";
  }

  /** Must be called from a user gesture the first time (browser autoplay rules). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master = gainNode(this.ctx, 0);
      this.master.connect(comp).connect(this.ctx.destination);
      this.buffers = makeBuffers(this.ctx);
      this.applyMaster();
      for (const ch of CHANNELS) this.apply(ch);
      this.timer = setInterval(() => this.schedule(), SCHEDULER_MS);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setMix(mix: Mix) {
    this.mix = { ...mix };
    if (this.ctx) for (const ch of CHANNELS) this.apply(ch);
  }

  setVolume(ch: Channel, v: number) {
    this.mix[ch] = v;
    if (this.ctx) this.apply(ch);
  }

  setMaster(v: number) {
    this.masterVolume = v;
    this.applyMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }

  on(cb: (event: "thunder") => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Soft bell for the end of a session. Plays even if the soundscape is silent. */
  chime(volume: number) {
    if (!this.ctx || volume <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const out = gainNode(ctx, volume * 0.5);
    out.connect(ctx.destination);
    // Inharmonic partials are what make a bell sound like a bell.
    const notes = [
      [659.25, 0],
      [987.77, 0.18],
      [1318.5, 0.36],
    ] as const;
    for (const [f, delay] of notes) {
      for (const [ratio, level, dur] of [
        [1, 0.5, 2.4],
        [2.76, 0.18, 1.2],
        [5.4, 0.07, 0.6],
      ] as const) {
        ping(ctx, out, t + delay, f * ratio, dur, level);
      }
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    for (const ch of [...this.channels.keys()]) this.teardown(ch, true);
    void this.ctx?.close();
    this.ctx = null;
  }

  private applyMaster() {
    if (!this.ctx || !this.master) return;
    const v = this.muted ? 0 : this.masterVolume;
    this.master.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.08);
  }

  private apply(ch: Channel) {
    const ctx = this.ctx!;
    const v = this.mix[ch];
    let node = this.channels.get(ch);
    if (v > 0 && !node) node = this.build(ch);
    if (!node) return;
    // Squared curve: sliders feel linear to the ear.
    node.gain.gain.setTargetAtTime(v * v * CHANNEL_LEVEL[ch], ctx.currentTime, 0.12);
    if (v === 0) this.teardown(ch);
  }

  private build(ch: Channel): ChannelNode {
    const ctx = this.ctx!;
    const gain = gainNode(ctx, 0);
    gain.connect(this.master!);
    const emit: Emit = (event, at) => {
      const delay = Math.max(0, (at - ctx.currentTime) * 1000);
      setTimeout(() => this.listeners.forEach((l) => l(event)), delay);
    };
    const { streams, nodes } = BUILDERS[ch](ctx, gain, this.buffers!, emit);
    const node: ChannelNode = {
      gain,
      streams,
      stop: () => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        }
        gain.disconnect();
      },
    };
    this.channels.set(ch, node);
    return node;
  }

  /** Fade out, then free the nodes so silent channels cost no CPU. */
  private teardown(ch: Channel, immediate = false) {
    const node = this.channels.get(ch);
    if (!node) return;
    this.channels.delete(ch);
    node.streams.length = 0;
    if (immediate) node.stop();
    else setTimeout(() => node.stop(), 600);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    for (const node of this.channels.values()) {
      for (const s of node.streams) {
        // After a long stall, skip ahead instead of firing a backlog all at once.
        if (s.nextAt < ctx.currentTime - 0.5) s.nextAt = ctx.currentTime + 0.05;
        while (s.nextAt < horizon) s.nextAt += s.fire(Math.max(s.nextAt, ctx.currentTime + 0.01));
      }
    }
  }
}
