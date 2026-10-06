"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Locus, Opening, Room } from "@/types/database";
import { toScene } from "@/lib/scene3d";
import { LocusMarkers, RoomShell, SceneLights } from "./RoomShell";
import { SceneSky } from "./SceneSky";
import { useSceneColors } from "./useSceneColors";
import { SceneGate } from "./SceneBoundary";

/** Read-only orbit view of a room with its numbered study path. */
export default function Room3DViewer({
  room,
  loci,
  openings,
  selectedId,
  onSelect,
  className = "h-[380px]",
}: {
  room: Room;
  loci: Locus[];
  openings: Opening[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}) {
  const colors = useSceneColors();
  const d = Math.max(room.width, room.depth) * 1.1 + 3;
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-border ${className}`}>
      <SceneGate title="3D preview couldn't start">
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
        camera={{ position: toScene({ x: room.width / 2 + d * 0.35, y: d * 0.75, z: room.depth / 2 - d * 0.8 }), fov: 50 }}
        onPointerMissed={() => onSelect?.(null)}
      >
        <color attach="background" args={[colors.horizon]} />
        <fog attach="fog" args={[colors.fog, d * 1.5, d * 4]} />
          <SceneSky colors={colors} radius={400} />
        <SceneLights colors={colors} />
        <RoomShell room={room} openings={openings} colors={colors} cutaway />
        <LocusMarkers
          room={room}
          loci={loci}
          colors={colors}
          selectedId={selectedId}
          onMarkerClick={
            onSelect
              ? (l, e) => {
                  e.stopPropagation();
                  onSelect(l.id);
                }
              : undefined
          }
        />
          <OrbitControls makeDefault target={toScene({ x: room.width / 2, y: room.height * 0.35, z: room.depth / 2 })} maxPolarAngle={Math.PI / 2.05} />
        </Canvas>
      </SceneGate>
    </div>
  );
}
