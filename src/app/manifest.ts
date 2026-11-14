import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Focus Room",
    short_name: "Focus Room",
    description: "Animated study space with a Pomodoro timer and ambient sounds.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070f",
    theme_color: "#060a18",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
