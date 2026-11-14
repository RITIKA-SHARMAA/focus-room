"use client";

import { useEffect, useRef } from "react";
import { SCENES, type SceneId } from "@/lib/scenes";

/**
 * Moving particles drawn on a <canvas> on top of the SVG scenery: rain and
 * drops on the glass, café bokeh, fireflies, snowfall. One requestAnimationFrame
 * loop, frame-rate independent (everything moves by `dt`), and the particle
 * count scales with screen area so phones don't do desktop-level work.
 */

interface Props {
  scene: SceneId;
  /** Subscribe to thunder; the canvas answers with a lightning flash. */
  subscribeThunder?: (cb: () => void) => () => void;
}

type Sim = {
  update: (dt: number, w: number, h: number) => void;
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.35)"));
  grad.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function rainSim(w: number, h: number, density: number): Sim {
  const streaks = Array.from({ length: Math.round(220 * density) }, () => ({
    x: rand(-100, w),
    y: rand(-h, h),
    len: rand(10, 26),
    v: rand(700, 1200),
    a: rand(0.08, 0.28),
  }));
  const drops = Array.from({ length: Math.round(46 * density) }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    r: rand(1.5, 5.5),
    vy: 0,
    trail: 0,
  }));
  const wind = 0.18;
  return {
    update(dt, W, H) {
      for (const s of streaks) {
        s.y += s.v * dt;
        s.x += s.v * wind * dt;
        if (s.y > H) {
          s.y = rand(-60, -10);
          s.x = rand(-100, W);
        }
      }
      for (const d of drops) {
        // Drops sit on the glass, then sometimes run down and leave a trail.
        if (d.vy === 0 && d.r > 3.2 && Math.random() < 0.0015) d.vy = rand(40, 140);
        if (d.vy > 0) {
          d.y += d.vy * dt;
          d.trail = Math.min(60, d.trail + d.vy * dt * 0.6);
          d.vy *= 0.995;
          if (d.vy < 8) d.vy = 0;
        } else d.trail = Math.max(0, d.trail - 20 * dt);
        if (d.y > H + 10) {
          d.y = rand(-20, H * 0.6);
          d.x = rand(0, W);
          d.vy = 0;
          d.trail = 0;
        }
      }
    },
    draw(g) {
      g.lineCap = "round";
      g.strokeStyle = "rgba(190,210,255,1)";
      for (const s of streaks) {
        g.globalAlpha = s.a;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(s.x - s.len * wind, s.y - s.len);
        g.stroke();
      }
      for (const d of drops) {
        if (d.trail > 1) {
          g.globalAlpha = 0.12;
          g.lineWidth = d.r * 0.8;
          g.beginPath();
          g.moveTo(d.x, d.y - d.trail);
          g.lineTo(d.x, d.y);
          g.stroke();
        }
        g.globalAlpha = 0.22;
        g.fillStyle = "rgba(160,190,240,1)";
        g.beginPath();
        g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.55;
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
  };
}

function cafeSim(w: number, h: number, density: number): Sim {
  const colors = ["rgba(255,184,110,1)", "rgba(255,140,90,1)", "rgba(255,214,150,1)", "rgba(255,120,150,1)"];
  const sprites = colors.map((c) => glowSprite(c, 128));
  const bokeh = Array.from({ length: Math.round(26 * density) }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    r: rand(24, 80),
    vx: rand(-8, 8),
    vy: rand(-10, -3),
    a: rand(0.05, 0.16),
    p: rand(0, Math.PI * 2),
    s: Math.floor(rand(0, sprites.length)),
  }));
  const dust = Array.from({ length: Math.round(50 * density) }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-6, 6),
    vy: rand(-6, 4),
    a: rand(0.15, 0.5),
  }));
  let t = 0;
  return {
    update(dt, W, H) {
      t += dt;
      for (const b of bokeh) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -b.r) {
          b.y = H + b.r;
          b.x = rand(0, W);
        }
        if (b.x < -b.r) b.x = W + b.r;
        if (b.x > W + b.r) b.x = -b.r;
      }
      for (const d of dust) {
        d.x += (d.vx + Math.sin(t + d.y * 0.01) * 4) * dt;
        d.y += d.vy * dt;
        if (d.y < 0 || d.y > H || d.x < 0 || d.x > W) {
          d.x = rand(0, W);
          d.y = rand(0, H);
        }
      }
    },
    draw(g) {
      g.globalCompositeOperation = "lighter";
      for (const b of bokeh) {
        g.globalAlpha = b.a * (0.75 + 0.25 * Math.sin(t * 0.8 + b.p));
        g.drawImage(sprites[b.s], b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      g.fillStyle = "#ffe2b8";
      for (const d of dust) {
        g.globalAlpha = d.a;
        g.fillRect(d.x, d.y, 1.4, 1.4);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    },
  };
}

function forestSim(w: number, h: number, density: number): Sim {
  const sprite = glowSprite("rgba(214,255,120,1)", 64);
  const flies = Array.from({ length: Math.round(42 * density) }, () => ({
    x: rand(0, w),
    y: rand(h * 0.35, h),
    ang: rand(0, Math.PI * 2),
    v: rand(10, 28),
    p: rand(0, Math.PI * 2),
    f: rand(0.4, 1.1),
    s: rand(14, 30),
  }));
  let t = 0;
  return {
    update(dt, W, H) {
      t += dt;
      for (const f of flies) {
        f.ang += rand(-1.5, 1.5) * dt;
        f.x += Math.cos(f.ang) * f.v * dt;
        f.y += Math.sin(f.ang) * f.v * dt * 0.6;
        if (f.x < -20) f.x = W + 20;
        if (f.x > W + 20) f.x = -20;
        if (f.y < H * 0.3) f.ang = Math.abs(f.ang);
        if (f.y > H + 10) f.ang = -Math.abs(f.ang);
      }
    },
    draw(g) {
      g.globalCompositeOperation = "lighter";
      for (const f of flies) {
        const pulse = Math.max(0, Math.sin(t * f.f * 2 + f.p));
        g.globalAlpha = 0.15 + pulse * 0.85;
        g.drawImage(sprite, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    },
  };
}

function snowSim(w: number, h: number, density: number): Sim {
  const flakes = Array.from({ length: Math.round(240 * density) }, () => {
    const r = rand(0.8, 3.4);
    return { x: rand(0, w), y: rand(-h, h), r, v: 20 + r * 18, p: rand(0, Math.PI * 2), a: rand(0.4, 0.95) };
  });
  let t = 0;
  return {
    update(dt, W, H) {
      t += dt;
      const wind = 18 + Math.sin(t * 0.2) * 14;
      for (const f of flakes) {
        f.y += f.v * dt;
        f.x += (wind * (f.r / 3) + Math.sin(t + f.p) * 10) * dt;
        if (f.y > H + 5) {
          f.y = -5;
          f.x = rand(-50, W);
        }
        if (f.x > W + 10) f.x = -10;
      }
    },
    draw(g) {
      g.fillStyle = "#fff";
      for (const f of flakes) {
        g.globalAlpha = f.a;
        g.beginPath();
        g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
  };
}

const SIMS: Record<SceneId, (w: number, h: number, density: number) => Sim> = {
  rain: rainSim,
  cafe: cafeSim,
  forest: forestSim,
  snow: snowSim,
};

export function SceneCanvas({ scene, subscribeThunder }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const flash = useRef({ level: 0, second: 0 });

  useEffect(() => {
    if (!subscribeThunder) return;
    return subscribeThunder(() => {
      const strength = SCENES[scene].flash;
      flash.current.level = strength * rand(0.45, 0.8);
      flash.current.second = Math.random() < 0.6 ? rand(0.08, 0.22) : 0; // flicker twice sometimes
    });
  }, [scene, subscribeThunder]);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let sim: Sim | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = Math.min(1.4, (w * h) / (1440 * 900));
      const density = Math.max(0.3, area) * (reduced ? 0.35 : 1);
      sim = SIMS[scene](w, h, density);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      // Clamp dt so a tab that was hidden doesn't make everything jump.
      const dt = Math.min(0.05, (now - last) / 1000) * (reduced ? 0.5 : 1);
      last = now;
      g.clearRect(0, 0, w, h);
      if (sim) {
        sim.update(dt, w, h);
        sim.draw(g, w, h);
      }
      const f = flash.current;
      if (f.level > 0.01) {
        g.fillStyle = `rgba(220,230,255,${f.level})`;
        g.fillRect(0, 0, w, h);
        f.level *= Math.pow(0.02, dt); // fast decay
        if (f.level < 0.05 && f.second > 0) {
          f.second -= dt;
          if (f.second <= 0) f.level = SCENES[scene].flash * 0.4;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [scene]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
