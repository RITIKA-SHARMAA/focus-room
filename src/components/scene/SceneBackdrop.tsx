"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { useMemo, type ReactNode } from "react";
import { SCENES, seeded, type SceneId } from "@/lib/scenes";

/**
 * The still parts of each scene, drawn as layered SVG. Layers further away move
 * less with the mouse than layers up close, which gives the parallax depth.
 * Small looping details (window flicker, lamp sway, steam, fog) are CSS
 * animations defined in globals.css.
 */

const W = 1600;
const H = 900;

interface Props {
  scene: SceneId;
  mx: MotionValue<number>;
  my: MotionValue<number>;
}

function Layer({ depth, mx, my, children }: { depth: number; mx: MotionValue<number>; my: MotionValue<number>; children: ReactNode }) {
  const x = useTransform(mx, (v) => v * -depth);
  const y = useTransform(my, (v) => v * -depth * 0.4);
  return <motion.g style={{ x, y }}>{children}</motion.g>;
}

function Sky({ id, stops }: { id: string; stops: string[] }) {
  return (
    <>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          {stops.map((c, i) => (
            <stop key={c + i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect x={-100} y={-100} width={W + 200} height={H + 200} fill={`url(#sky-${id})`} />
    </>
  );
}

function Stars({ seed, count, maxY }: { seed: number; count: number; maxY: number }) {
  const stars = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, () => ({
      x: r() * W,
      y: r() * maxY,
      s: r() * 1.4 + 0.4,
      o: r() * 0.6 + 0.2,
      d: r() * 6,
    }));
  }, [seed, count, maxY]);
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" opacity={s.o} className="twinkle" style={{ animationDelay: `${s.d}s` }} />
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- Rainy Night */

function useSkyline(seed: number, minH: number, maxH: number, withWindows: boolean) {
  return useMemo(() => {
    const r = seeded(seed);
    const buildings: { x: number; w: number; h: number; antenna: boolean }[] = [];
    const windows: { x: number; y: number; o: number; flicker: boolean; d: number }[] = [];
    let x = -120;
    while (x < W + 120) {
      const w = 60 + r() * 120;
      const h = minH + r() * (maxH - minH);
      buildings.push({ x, w, h, antenna: r() < 0.2 });
      if (withWindows) {
        for (let wy = H - h + 18; wy < H - 20; wy += 22) {
          for (let wx = x + 10; wx < x + w - 14; wx += 18) {
            if (r() < 0.2) windows.push({ x: wx, y: wy, o: 0.35 + r() * 0.6, flicker: r() < 0.08, d: r() * 9 });
          }
        }
      }
      x += w + r() * 8;
    }
    return { buildings, windows };
  }, [seed, minH, maxH, withWindows]);
}

function RainyNight({ mx, my }: Omit<Props, "scene">) {
  const far = useSkyline(11, 260, 520, false);
  const near = useSkyline(29, 140, 380, true);
  return (
    <>
      <Sky id="rain" stops={SCENES.rain.sky} />
      <defs>
        <radialGradient id="rain-moon">
          <stop offset="0" stopColor="#cfe0ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#cfe0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rain-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6fb8" stopOpacity="0" />
          <stop offset="1" stopColor="#ff9a5c" stopOpacity="0.28" />
        </linearGradient>
        <filter id="blur-30">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>
      <Layer depth={3} mx={mx} my={my}>
        <circle cx={1180} cy={170} r={220} fill="url(#rain-moon)" />
        <g filter="url(#blur-30)" opacity={0.55} className="drift-slow">
          <ellipse cx={300} cy={140} rx={380} ry={70} fill="#1d2a4a" />
          <ellipse cx={1100} cy={110} rx={460} ry={80} fill="#1a2645" />
          <ellipse cx={800} cy={260} rx={520} ry={60} fill="#18233f" />
        </g>
      </Layer>
      <Layer depth={7} mx={mx} my={my}>
        {far.buildings.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill="#111d39" />
            {b.antenna && <rect x={b.x + b.w / 2} y={H - b.h - 40} width={2} height={40} fill="#111d39" />}
            {b.antenna && <circle cx={b.x + b.w / 2 + 1} cy={H - b.h - 40} r={3} fill="#ff5a5a" className="blink" />}
          </g>
        ))}
      </Layer>
      <rect x={-100} y={H - 360} width={W + 200} height={360} fill="url(#rain-haze)" />
      <Layer depth={16} mx={mx} my={my}>
        {near.buildings.map((b, i) => (
          <rect key={i} x={b.x} y={H - b.h} width={b.w} height={b.h} fill="#080f20" />
        ))}
        {near.windows.map((w, i) => (
          <rect
            key={i}
            x={w.x}
            y={w.y}
            width={9}
            height={12}
            rx={1}
            fill="#ffcd7a"
            opacity={w.o}
            className={w.flicker ? "flicker" : undefined}
            style={w.flicker ? { animationDelay: `${w.d}s` } : undefined}
          />
        ))}
      </Layer>
    </>
  );
}

/* ---------------------------------------------------------------- Café Corner */

function Lamp({ x, len, delay }: { x: number; len: number; delay: number }) {
  return (
    <g className="sway" style={{ transformOrigin: `${x}px 0px`, animationDelay: `${delay}s` }}>
      <line x1={x} y1={0} x2={x} y2={len} stroke="#1a0f0a" strokeWidth={2} />
      <circle cx={x} cy={len + 46} r={170} fill="url(#cafe-lampglow)" />
      <path d={`M ${x - 44} ${len + 40} Q ${x} ${len - 14} ${x + 44} ${len + 40} Z`} fill="#24140d" />
      <ellipse cx={x} cy={len + 40} rx={44} ry={6} fill="#ffcf8a" />
      <circle cx={x} cy={len + 44} r={9} fill="#fff1d6" />
    </g>
  );
}

function CafeCorner({ mx, my }: Omit<Props, "scene">) {
  return (
    <>
      <Sky id="cafe" stops={SCENES.cafe.sky} />
      <defs>
        <radialGradient id="cafe-lampglow">
          <stop offset="0" stopColor="#ffc27a" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#ff9a4a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cafe-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1430" />
          <stop offset="1" stopColor="#2a2240" />
        </linearGradient>
        <linearGradient id="cafe-counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b3b22" />
          <stop offset="0.06" stopColor="#3d2012" />
          <stop offset="1" stopColor="#1c0e08" />
        </linearGradient>
      </defs>
      <Layer depth={4} mx={mx} my={my}>
        {/* Big window onto the street */}
        <rect x={420} y={120} width={760} height={560} rx={18} fill="url(#cafe-window)" />
        <g opacity={0.5}>
          {Array.from({ length: 14 }, (_, i) => (
            <circle
              key={i}
              cx={460 + i * 52}
              cy={560 + ((i * 37) % 70)}
              r={10 + ((i * 13) % 18)}
              fill={i % 3 ? "#ffb05c" : "#ff6f8a"}
              opacity={0.35}
            />
          ))}
        </g>
        <rect x={420} y={120} width={760} height={560} rx={18} fill="none" stroke="#1a0d07" strokeWidth={22} />
        <rect x={789} y={120} width={22} height={560} fill="#1a0d07" />
        <rect x={420} y={390} width={760} height={18} fill="#1a0d07" />
      </Layer>
      <Layer depth={9} mx={mx} my={my}>
        {/* Shelf with jars and a plant */}
        <rect x={1250} y={330} width={300} height={12} fill="#22120a" />
        <rect x={1270} y={280} width={34} height={50} rx={6} fill="#3a2215" />
        <rect x={1314} y={262} width={28} height={68} rx={6} fill="#2e1a10" />
        <rect x={1356} y={292} width={40} height={38} rx={8} fill="#45291a" />
        <path
          d="M1460 330 q-10 -40 -30 -60 M1470 330 q4 -50 30 -70 M1480 330 q20 -30 46 -34"
          stroke="#2f4a22"
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />
        <rect x={1446} y={300} width={50} height={30} rx={4} fill="#5a3320" />
        <rect x={60} y={300} width={260} height={12} fill="#22120a" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={80 + i * 26}
            y={232 + (i % 2) * 10}
            width={20}
            height={68 - (i % 2) * 10}
            rx={2}
            fill={["#4a2a1a", "#5c341f", "#3b2216"][i % 3]}
          />
        ))}
      </Layer>
      <Layer depth={14} mx={mx} my={my}>
        <Lamp x={260} len={170} delay={0} />
        <Lamp x={1340} len={130} delay={1.3} />
      </Layer>
      <Layer depth={22} mx={mx} my={my}>
        <rect x={-100} y={770} width={W + 200} height={200} fill="url(#cafe-counter)" />
        {/* Coffee cup with steam */}
        <g transform="translate(1150 700)">
          <g className="steam" opacity={0.5}>
            <path d="M22 0 q-14 -26 0 -52 q14 -26 0 -52" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" />
            <path
              d="M44 -6 q-14 -26 0 -52 q14 -26 0 -52"
              stroke="#fff"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              style={{ animationDelay: "1.4s" }}
            />
          </g>
          <ellipse cx={34} cy={72} rx={66} ry={10} fill="#140a06" />
          <path d="M0 8 h70 v38 a35 30 0 0 1 -70 0 Z" fill="#efe2cf" />
          <path d="M70 18 a16 14 0 1 1 0 26" stroke="#efe2cf" strokeWidth={8} fill="none" />
          <ellipse cx={35} cy={8} rx={35} ry={7} fill="#5a3018" />
        </g>
        {/* Books and a small plant */}
        <rect x={360} y={732} width={150} height={20} rx={3} fill="#7a3b2a" />
        <rect x={372} y={712} width={130} height={20} rx={3} fill="#2f4a5c" />
        <rect x={366} y={694} width={140} height={18} rx={3} fill="#c09a5a" />
        <path
          d="M600 740 q-20 -50 -6 -90 M606 740 q10 -60 40 -80 M612 740 q24 -30 52 -30"
          stroke="#3d5e2a"
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
        />
        <path d="M580 740 h64 l-8 32 h-48 Z" fill="#a0543a" />
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------- Firefly Forest */

function pines(seed: number, count: number, baseY: number, minH: number, maxH: number) {
  const r = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const x = (i / count) * (W + 300) - 150 + (r() - 0.5) * 80;
    const h = minH + r() * (maxH - minH);
    return { x, h, w: h * (0.32 + r() * 0.1), y: baseY + r() * 30 };
  });
}

function Pine({ x, y, h, w, fill, snow }: { x: number; y: number; h: number; w: number; fill: string; snow?: boolean }) {
  const tiers = 4;
  const parts: ReactNode[] = [];
  for (let i = 0; i < tiers; i++) {
    const top = y - h + (i * h) / (tiers + 0.6);
    const bottom = top + h / 2.2;
    const half = (w / 2) * ((i + 1.4) / (tiers + 0.4));
    parts.push(<polygon key={i} points={`${x},${top} ${x - half},${bottom} ${x + half},${bottom}`} fill={fill} />);
    if (snow) {
      // A thin drift along each tier's lower edge, plus a cap on the top tier.
      const t = Math.max(4, h * 0.012);
      parts.push(
        <polygon
          key={`s${i}`}
          points={`${x - half},${bottom} ${x + half},${bottom} ${x + half * 0.72},${bottom - t} ${x - half * 0.72},${bottom - t}`}
          fill="#e6e9fb"
          opacity={0.75}
        />,
      );
      if (i === 0) {
        const d = (bottom - top) * 0.28;
        const hw = half * (d / (bottom - top));
        parts.push(
          <polygon
            key="cap"
            points={`${x},${top} ${x - hw},${top + d} ${x - hw * 0.3},${top + d * 0.8} ${x + hw * 0.4},${top + d} ${x + hw},${top + d}`}
            fill="#eef0fb"
          />,
        );
      }
    }
  }
  return (
    <g>
      <rect x={x - w * 0.04} y={y - h * 0.12} width={w * 0.08} height={h * 0.16} fill={fill} />
      {parts}
    </g>
  );
}

function FireflyForest({ mx, my }: Omit<Props, "scene">) {
  const far = useMemo(() => pines(3, 26, 700, 220, 360), []);
  const mid = useMemo(() => pines(7, 16, 800, 320, 500), []);
  const near = useMemo(() => pines(13, 7, 940, 560, 760).filter((p) => p.x < 360 || p.x > 1240), []);
  return (
    <>
      <Sky id="forest" stops={SCENES.forest.sky} />
      <defs>
        <radialGradient id="forest-moon">
          <stop offset="0" stopColor="#f6f2d8" stopOpacity="0.5" />
          <stop offset="0.25" stopColor="#d8e8c8" stopOpacity="0.12" />
          <stop offset="1" stopColor="#d8e8c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="forest-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe8d0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#bfe8d0" stopOpacity="0.09" />
          <stop offset="1" stopColor="#bfe8d0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Layer depth={2} mx={mx} my={my}>
        <Stars seed={5} count={90} maxY={420} />
        <circle cx={1180} cy={190} r={260} fill="url(#forest-moon)" />
        <circle cx={1180} cy={190} r={54} fill="#f4efd6" />
        <circle cx={1166} cy={178} r={10} fill="#e2dcbd" />
        <circle cx={1196} cy={206} r={7} fill="#e2dcbd" />
      </Layer>
      <Layer depth={6} mx={mx} my={my}>
        <path
          d="M-100 640 L180 480 L360 590 L560 450 L780 600 L980 470 L1200 590 L1420 480 L1700 620 L1700 900 L-100 900 Z"
          fill="#0a2620"
          opacity={0.8}
        />
        {far.map((p, i) => (
          <Pine key={i} {...p} fill="#0a2a22" />
        ))}
      </Layer>
      <rect x={-200} y={560} width={W + 400} height={200} fill="url(#forest-fog)" className="drift-fog" />
      <Layer depth={12} mx={mx} my={my}>
        {mid.map((p, i) => (
          <Pine key={i} {...p} fill="#061b16" />
        ))}
        <rect x={-100} y={800} width={W + 200} height={200} fill="#041311" />
      </Layer>
      <Layer depth={26} mx={mx} my={my}>
        {near.map((p, i) => (
          <Pine key={i} {...p} fill="#020a08" />
        ))}
      </Layer>
    </>
  );
}

/* ----------------------------------------------------------------- Snow Cabin */

const FAR_RIDGE: [number, number][] = [
  [-100, 640],
  [220, 380],
  [420, 520],
  [700, 330],
  [960, 540],
  [1180, 400],
  [1420, 520],
  [1700, 420],
];

/** Snow caps that follow the actual slopes: for each peak, a jagged line ~25% of the way down both sides. */
function snowCaps(ridge: [number, number][]): string {
  const out: string[] = [];
  for (let i = 1; i < ridge.length - 1; i++) {
    const [px, py] = ridge[i];
    const [lx, ly] = ridge[i - 1];
    const [rx, ry] = ridge[i + 1];
    if (py >= ly || py >= ry) continue; // not a peak
    const at = (ax: number, ay: number, t: number) => [px + (ax - px) * t, py + (ay - py) * t];
    const [ax, ay] = at(lx, ly, 0.26);
    const [bx, by] = at(rx, ry, 0.26);
    const [m1x, m1y] = [ax + (bx - ax) * 0.3, ay + (by - ay) * 0.3 - 16];
    const [m2x, m2y] = [ax + (bx - ax) * 0.55, ay + (by - ay) * 0.55 + 4];
    const [m3x, m3y] = [ax + (bx - ax) * 0.78, ay + (by - ay) * 0.78 - 14];
    out.push(`M${px} ${py} L${ax} ${ay} L${m1x} ${m1y} L${m2x} ${m2y} L${m3x} ${m3y} L${bx} ${by} Z`);
  }
  return out.join(" ");
}

function SnowCabin({ mx, my }: Omit<Props, "scene">) {
  const near = useMemo(() => pines(21, 6, 930, 380, 560).filter((p) => p.x < 420 || p.x > 1500), []);
  return (
    <>
      <Sky id="snow" stops={SCENES.snow.sky} />
      <defs>
        <linearGradient id="aurora-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5cf2c0" stopOpacity="0" />
          <stop offset="0.4" stopColor="#5cf2c0" stopOpacity="0.5" />
          <stop offset="0.7" stopColor="#9f7bff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#9f7bff" stopOpacity="0" />
        </linearGradient>
        <filter id="blur-18">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <linearGradient id="snow-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8e6f6" />
          <stop offset="1" stopColor="#8f8fbf" />
        </linearGradient>
        <radialGradient id="cabin-glow">
          <stop offset="0" stopColor="#ffb35c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb35c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <Layer depth={2} mx={mx} my={my}>
        <Stars seed={9} count={60} maxY={300} />
        <g filter="url(#blur-18)" className="aurora">
          <path d="M-50 260 C 300 120, 600 300, 900 170 S 1400 120, 1700 230" stroke="url(#aurora-a)" strokeWidth={70} fill="none" />
          <path
            d="M100 330 C 400 220, 700 360, 1000 250 S 1450 220, 1650 300"
            stroke="url(#aurora-a)"
            strokeWidth={40}
            fill="none"
            opacity={0.6}
          />
        </g>
      </Layer>
      <Layer depth={5} mx={mx} my={my}>
        <path d={`M${FAR_RIDGE.map((p) => p.join(" ")).join(" L")} L1700 900 L-100 900 Z`} fill="#3a3566" />
        <path d={snowCaps(FAR_RIDGE)} fill="#e8e6f6" opacity={0.75} />
      </Layer>
      <Layer depth={10} mx={mx} my={my}>
        <path d="M-100 720 L160 560 L380 680 L640 540 L900 690 L1120 580 L1360 690 L1700 560 L1700 900 L-100 900 Z" fill="#2a2650" />
      </Layer>
      <Layer depth={16} mx={mx} my={my}>
        <path d="M-100 800 Q 400 700 900 780 T 1700 760 L1700 1000 L-100 1000 Z" fill="url(#snow-ground)" />
        {/* Cabin */}
        <g transform="translate(1180 640)">
          <circle cx={70} cy={90} r={170} fill="url(#cabin-glow)" />
          <rect x={98} y={-12} width={22} height={50} fill="#2b1a1a" />
          <g className="smoke">
            <circle cx={109} cy={-24} r={10} fill="#cfd0e8" opacity={0.35} />
            <circle cx={116} cy={-46} r={14} fill="#cfd0e8" opacity={0.25} style={{ animationDelay: "1.2s" }} />
            <circle cx={104} cy={-72} r={18} fill="#cfd0e8" opacity={0.18} style={{ animationDelay: "2.4s" }} />
          </g>
          <rect x={0} y={60} width={150} height={100} fill="#2b1a1a" />
          <polygon points="-18,64 75,-4 168,64" fill="#1f1212" />
          <polygon points="-22,66 75,-10 172,66 160,70 75,6 -10,70" fill="#eef0fb" />
          <rect x={24} y={86} width={36} height={32} rx={2} fill="#ffb35c" className="glow-pulse" />
          <rect x={41} y={86} width={2} height={32} fill="#2b1a1a" />
          <rect x={92} y={98} width={34} height={62} rx={2} fill="#1a0f0f" />
        </g>
        {near.map((p, i) => (
          <Pine key={i} {...p} fill="#151634" snow />
        ))}
      </Layer>
    </>
  );
}

export function SceneBackdrop({ scene, mx, my }: Props) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
      {scene === "rain" && <RainyNight mx={mx} my={my} />}
      {scene === "cafe" && <CafeCorner mx={mx} my={my} />}
      {scene === "forest" && <FireflyForest mx={mx} my={my} />}
      {scene === "snow" && <SnowCabin mx={mx} my={my} />}
    </svg>
  );
}
