"use client";

import dynamic from "next/dynamic";

/**
 * The app reads localStorage and uses Web Audio and canvas, all browser-only,
 * so it renders on the client. The server sends this lightweight splash first.
 */
const FocusRoom = dynamic(() => import("./FocusRoom"), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-[radial-gradient(ellipse_at_50%_40%,#1b2a4f,#05070f_70%)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-white/15 border-t-white/80 [animation-duration:1.6s]" />
        <p className="font-display text-2xl text-white/80">Focus Room</p>
      </div>
    </div>
  ),
});

export function ClientRoot() {
  return <FocusRoom />;
}
