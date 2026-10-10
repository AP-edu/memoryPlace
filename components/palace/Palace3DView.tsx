"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html, OrbitControls } from "@react-three/drei";
import type { Locus, Opening, Room } from "@/types/database";
import { palaceBounds, palaceCameraDistance, palaceLevelRooms } from "@/lib/palaceScene";
import { sharedSpans, twinFramedOpenings } from "@/lib/building";
import { easeInOut, fromScene, toScene } from "@/lib/scene3d";
import { placeAt, type FurnitureItem, type FurnitureKind } from "@/lib/furniture";
import { RoomFurniture } from "../scene3d/Furniture";
import { LocusMarkers, RoomShell, SceneLights } from "../scene3d/RoomShell";
import { SceneSky } from "../scene3d/SceneSky";
import { useSceneColors } from "../scene3d/useSceneColors";
import { SceneGate } from "../scene3d/SceneBoundary";

/**
 * Glide the orbit camera to a new target/distance, keeping the current viewing
 * direction (selecting a room "leans in" to it; deselecting pulls back out).
 */
function CameraFocus({ target, distance }: { target: [number, number, number]; distance: number }) {
  const get = useThree((s) => s.get);
  const anim = useRef<{ fromT: THREE.Vector3; fromP: THREE.Vector3; toT: THREE.Vector3; toP: THREE.Vector3; k: number } | null>(null);
  const key = `${target.map((n) => n.toFixed(2)).join(",")}|${distance.toFixed(2)}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // the initial camera already frames this
      return;
    }
    const { camera, controls } = get();
    const ctl = controls as unknown as { target: THREE.Vector3 } | null;
    if (!ctl) return;
    const dir = camera.position.clone().sub(ctl.target).normalize();
    const toT = new THREE.Vector3(...target);
    anim.current = { fromT: ctl.target.clone(), fromP: camera.position.clone(), toT, toP: toT.clone().addScaledVector(dir, distance), k: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures target + distance
  }, [key, get]);
  useFrame((state, dt) => {
    const a = anim.current;
    const ctl = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (!a || !ctl) return;
    a.k = Math.min(1, a.k + dt / 0.7);
    const e = easeInOut(a.k);
    ctl.target.lerpVectors(a.fromT, a.toT, e);
    state.camera.position.lerpVectors(a.fromP, a.toP, e);
    ctl.update();
    if (a.k >= 1) anim.current = null;
  });
  return null;
}

/** Studio mode: place, select and drag furniture (positions are room-local metres). */
export interface FurnishMode {
  furniture: Record<string, FurnitureItem[]>;
  placing: FurnitureKind | null;
  selected: { roomId: string; itemId: string } | null;
  dragging: { roomId: string; itemId: string } | null;
  onPlace: (roomId: string, at: { x: number; z: number }) => void;
  onItemDown: (roomId: string, item: FurnitureItem) => void;
  onDrag: (at: { x: number; z: number }) => void;
}

/**
 * Whole-palace 3D overview: every room on ONE level, orbitable, with every
 * locus drawn as a small marker. Click a room to select it (syncs with the 2D
 * canvas and the room cards); the selected room gets an "Add loci" link that
 * opens its editor straight in place mode. Placing itself stays per-room.
 */
export default function Palace3DView({
  rooms,
  openings,
  levelId,
  fallbackLevelId,
  selectedId,
  onSelect,
  loci = [],
  furnish,
  className = "h-[560px]",
}: {
  /** Studio: furniture editing on top of the overview. */
  furnish?: FurnishMode;
  rooms: Room[];
  openings: Opening[];
  /** Loci in this palace (any level); only those in shown rooms are drawn. */
  loci?: Locus[];
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
  // One building: shared walls are drawn once per side, linked doors framed once.
  const shared = useMemo(() => {
    const placed = entries.map((e) => e.room);
    return new Map(placed.map((r) => [r.id, sharedSpans(r, placed)]));
  }, [entries]);
  const twinFramed = useMemo(() => twinFramedOpenings(entries.flatMap((e) => e.openings)), [entries]);
  const maxHeight = useMemo(() => entries.reduce((m, e) => Math.max(m, e.room.height), 3), [entries]);
  // Placement preview: where the next piece would land (room-local).
  const [hover, setHover] = useState<{ roomId: string; x: number; z: number } | null>(null);
  const placing = furnish?.placing ?? null;
  const dragging = furnish?.dragging ?? null;
  const dragOffset = dragging ? entries.find((e) => e.room.id === dragging.roomId)?.offset ?? null : null;

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
          // While placing furniture a stray click outside the rooms must not drop the selection.
          onPointerMissed={() => !placing && onSelect?.(null)}
        >
          <color attach="background" args={[colors.horizon]} />
          <fog attach="fog" args={[colors.fog, d * 1.5, d * 4]} />
          <SceneSky colors={colors} radius={400} />
          <SceneLights colors={colors} />
          {entries.map(({ room, openings: roomOpenings, offset }) => {
            const local = (p: { x: number; y: number; z: number }) => {
              const w = fromScene(p);
              return { x: w.x - offset.x, z: w.z - offset.z };
            };
            const ghostKind = placing && hover?.roomId === room.id ? placing : null;
            return (
            <group
              key={room.id}
              position={toScene({ x: offset.x, y: 0, z: offset.z })}
              onClick={(e) => {
                if (e.delta > 4) return; // end of an orbit drag, not a click
                e.stopPropagation();
                if (placing && furnish) furnish.onPlace(room.id, local(e.point));
                else onSelect?.(room.id);
              }}
              onPointerMove={placing ? (e) => setHover({ roomId: room.id, ...local(e.point) }) : undefined}
              onPointerOut={placing ? () => setHover((h) => (h?.roomId === room.id ? null : h)) : undefined}
            >
              {/* Floor is pickable here: it's the natural click target for "select this room". */}
              <RoomShell
                room={room}
                openings={roomOpenings}
                colors={colors}
                cutaway
                floorRaycast
                shared={shared.get(room.id)}
                twinFramed={twinFramed}
                furniture={furnish?.furniture[room.id]}
                furnitureSelectedId={furnish?.selected?.roomId === room.id ? furnish.selected.itemId : null}
                furnitureDraggingId={dragging?.roomId === room.id ? dragging.itemId : null}
                onFurnitureDown={
                  furnish && !placing
                    ? (item, e) => {
                        e.stopPropagation();
                        furnish.onItemDown(room.id, item);
                      }
                    : undefined
                }
                onFurnitureClick={furnish && !placing ? (_item, e) => e.stopPropagation() : undefined}
              />
              {ghostKind && hover && (
                <RoomFurniture
                  ghost
                  roomHeight={room.height}
                  items={[placeAt({ id: "__ghost", kind: ghostKind, rot: 0, x: 0, z: 0 } as FurnitureItem, hover.x, hover.z, room)]}
                />
              )}
              <LocusMarkers
                room={room}
                loci={loci.filter((l) => l.room_id === room.id)}
                colors={colors}
                showPath={false}
                showLabels={false}
              />
              {room.id === selectedId && !furnish && (
                <Html position={toScene({ x: room.width / 2, y: room.height + 0.6, z: room.depth / 2 })} center>
                  <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-md">
                    {room.title} · {loci.filter((l) => l.room_id === room.id).length} loci
                    <a
                      href={`/rooms/${room.id}?tool=place`}
                      className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground hover:opacity-90"
                      onClick={(e) => e.stopPropagation()}
                    >
                      + Add loci
                    </a>
                  </div>
                </Html>
              )}
            </group>
            );
          })}
          {/* While dragging a piece: a level-wide floor plane catches the pointer. */}
          {dragging && dragOffset && furnish && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[bounds.cx, 0.01, -bounds.cz]}
              onPointerMove={(e) => {
                e.stopPropagation();
                const w = fromScene(e.point);
                furnish.onDrag({ x: w.x - dragOffset.x, z: w.z - dragOffset.z });
              }}
            >
              <planeGeometry args={[bounds.span * 4 + 40, bounds.span * 4 + 40]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
          <OrbitControls makeDefault enabled={!dragging} target={target} maxPolarAngle={Math.PI / 2.05} />
          {furnish && (
            <CameraFocus
              {...(() => {
                const e = entries.find((x) => x.room.id === selectedId);
                if (!e) return { target: [target[0], target[1], target[2]] as [number, number, number], distance: Math.hypot(camPos[0] - target[0], camPos[1] - target[1], camPos[2] - target[2]) };
                const t = toScene({ x: e.offset.x + e.room.width / 2, y: 0, z: e.offset.z + e.room.depth / 2 });
                return { target: [t[0], t[1], t[2]] as [number, number, number], distance: palaceCameraDistance(Math.max(e.room.width, e.room.depth)) * 0.95 + e.room.height };
              })()}
            />
          )}
        </Canvas>
      </SceneGate>
    </div>
  );
}
