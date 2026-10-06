import type { MetadataRoute } from "next";

// Installable-app basics (a first step toward mobile): name, colours, icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MemoryPlace",
    short_name: "MemoryPlace",
    description: "Build a memory palace in 2D, walk it in 3D, and recall everything you place there.",
    start_url: "/home",
    display: "standalone",
    background_color: "#f3f8fd",
    theme_color: "#1d5fc4",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
