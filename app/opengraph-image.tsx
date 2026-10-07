import { ImageResponse } from "next/og";

export const alt = "MemoryPlace — build, walk and recall your memory palace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #5a9fe6 0%, #d6e9fa 70%, #f7f4ec 100%)",
          color: "#0b1b33",
        }}
      >
        <div style={{ fontSize: 24, letterSpacing: 8, textTransform: "uppercase", color: "#7a5500" }}>
          A memory palace for your studies
        </div>
        <div style={{ fontSize: 120, fontWeight: 700, marginTop: 16 }}>MemoryPlace</div>
        <div style={{ fontSize: 34, marginTop: 20, maxWidth: 900, textAlign: "center", color: "#1750a8" }}>
          Design rooms in 2D. Walk them in 3D. Recall everything you place there.
        </div>
      </div>
    ),
    size
  );
}
