import { ImageResponse } from "next/og";

export const alt = "Focus Room: animated study space";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview card shown when the link is shared on LinkedIn, WhatsApp, Slack, etc. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #060a18 0%, #101d3b 55%, #22355f 100%)",
        color: "white",
        fontFamily: "serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
        <div
          style={{
            width: 260,
            height: 260,
            borderRadius: 999,
            border: "10px solid rgba(255,255,255,0.15)",
            borderTopColor: "#8fb4ff",
            borderRightColor: "#8fb4ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 76,
          }}
        >
          25:00
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96 }}>Focus Room</div>
          <div style={{ fontSize: 32, opacity: 0.7, maxWidth: 560 }}>
            Animated scenes, live ambient sound and a Pomodoro timer for deep work.
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
