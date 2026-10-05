"use client";
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { Opening, Room } from "@/types/database";
import { palaceBounds, palaceCameraDistance, palaceLevelRooms } from "@/lib/palaceScene";
import { toScene } from "@/lib/scene3d";
import { RoomShell, SceneLights } from "../scene3d/RoomShell";
import { useSceneColors } from "../scene3d/useSceneColors";
import { SceneGate } from "../scene3d/SceneBoundary";

/**
 * Whole-palace 3D overview: every room on ONE level, orbitable.
 * Read-only — click a room to select it (syncs with the 2D canvas and the
 * room cards). Editing stays in the 2D blueprint and the per-room editor.
 */
export default function Palace3DView({
  rooms,
  openings,
  levelId,
  fallbackLevelId,
  selectedId,
  onSelect,
  className = "h-[560px]",
}: {
  rooms: Room[];
  openings: Opening[];
  levelId: string | null;
  fallbackLevelId: string | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}) {
  const colors = useSceneColors();
  const entries = useMemo(
    () => palaceLevelRooms(rooms, openings, levelId, fallbackLevelId),
    [rooms, openings, levelId, fallbackLevelId]
  );
  const bounds = useMemo(() => palaceBounds(entries), [entries]);
  const maxHeight = useMemo(() => entries.reduce((m, e) => Math.max(m, e.room.height), 3), [entries]);

  if (!bounds) {
    return (
      <div className={`flex w-full items-center justify-center rounded-lg border border-border bg-background ${className}`}>
        <p className="text-sm text-muted-foreground">No rooms on this level yet — draw some in the 2D blueprint.</p>
      </div>
    );
  }

  const d = palaceCameraDistance(bounds.span) + maxHeight;
  const target = toScene({ x: bounds.cx, y: 0, z: bounds.cz });
  const camPos = toScene({ x: bounds.cx + d * 0.35, y: d * 0.75, z: bounds.cz - d * 0.8 });

  return (
    <div className={`w-full overflow-hidden rounded-lg border border-border ${className}`}>
      <SceneGate title="3D palace couldn't start">
        {/* Remount per level so the camera refits to the new bounds. */}
        <Canvas
          key={levelId ?? "none"}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
          camera={{ position: camPos, fov: 50 }}
          onPointerMissed={() => onSelect?.(null)}
        >
          <color attach="background" args={[colors.sky]} />
          <fog attach="fog" args={[colors.fog, d * 1.5, d * 4]} />
          <SceneLights colors={colors} />
          {entries.map(({ room, openings: roomOpenings, offset }) => (
            <group
              key={room.id}
              position={toScene({ x: offset.x, y: 0, z: offset.z })}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(room.id);
              }}
            >
              <RoomShell room={room} openings={roomOpenings} colors={colors} cutaway />
              {room.id === selectedId && (
                <Html position={toScene({ x: room.width / 2, y: room.height + 0.6, z: room.depth / 2 })} center>
                  <div className="whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-md">
                    {room.title}
                  </div>
                </Html>
              )}
            </group>
          ))}
          <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2.05} />
        </Canvas>
      </SceneGate>
    </div>
  );
}
