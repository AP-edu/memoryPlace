"use client";
import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { Locus, Opening, Room, WallFace } from "@/types/database";
import { locusWorldPos, openingWidthM, wallPoint } from "@/lib/geometry";
import { wallSpans } from "@/lib/walk";
import { cutawayWalls, fromScene, inwardNormal, toScene, tourOrder, WALL_FACES } from "@/lib/scene3d";
import type { SceneColors } from "./useSceneColors";
import { isHallway } from "@/lib/hallway";

// Shared 3D room geometry for the room editor, the palace preview and walk
// mode. Everything is authored in world coords and placed with toScene()
// (z negated) so the 3D room matches the 2D plan instead of mirroring it.

export const WALL_THICK = 0.16;
const noRaycast = () => null;

export interface WallPointerEvent {
  wall: WallFace;
  /** Hit point in world coordinates. */
  point: { x: number; y: number; z: number };
  event: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>;
}

function lintelHeight(o: Opening, room: Room): number {
  return o.kind === "door" ? Math.min(2.1, room.height - 0.1) : Math.max(1.8, room.height - 0.35);
}

export function RoomShell({
  room,
  openings,
  colors,
  cutaway = false,
  onWallClick,
  onWallMove,
  floorRaycast = false,
  onFloorMove,
}: {
  room: Room;
  openings: Opening[];
  colors: SceneColors;
  /** Fade walls between an outside (orbit) camera and the interior; faded walls ignore clicks. */
  cutaway?: boolean;
  onWallClick?: (e: WallPointerEvent) => void;
  onWallMove?: (e: WallPointerEvent) => void;
  floorRaycast?: boolean;
  onFloorMove?: (point: { x: number; y: number; z: number }) => void;
}) {
  const size = { width: room.width, depth: room.depth };
  const wallRefs = useRef<Partial<Record<WallFace, THREE.Group | null>>>({});
  const lastCut = useRef<string>("");

  useFrame(({ camera }) => {
    if (!cutaway) return;
    const cam = fromScene(camera.position);
    const cut = cutawayWalls(cam, room);
    const key = [...cut].sort().join(",");
    if (key === lastCut.current) return;
    lastCut.current = key;
    for (const wall of WALL_FACES) {
      const g = wallRefs.current[wall];
      if (!g) continue;
      const hidden = cut.has(wall);
      g.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.transparent = hidden;
        mat.opacity = hidden ? 0.12 : 1;
        mat.depthWrite = !hidden;
        mesh.raycast = hidden ? noRaycast : THREE.Mesh.prototype.raycast;
      });
    }
  });

  const handler = (wall: WallFace, cb?: (e: WallPointerEvent) => void) =>
    cb
      ? (e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) => cb({ wall, point: fromScene(e.point), event: e })
      : undefined;

  // Room colour tints the themed floor so it reads in light and dark.
  // Hallways get a cooler, path-coloured floor so they read as corridors.
  const hallway = isHallway(room);
  const floorColor = useMemo(() => {
    const tint = room.background ?? (hallway ? colors.archway : null);
    return tint ? "#" + new THREE.Color(colors.floor).lerp(new THREE.Color(tint), hallway && !room.background ? 0.18 : 0.35).getHexString() : colors.floor;
  }, [room.background, colors.floor, colors.archway, hallway]);

  return (
    <group>
      <mesh
        position={toScene({ x: room.width / 2, y: -0.05, z: room.depth / 2 })}
        raycast={floorRaycast ? undefined : noRaycast}
        onPointerMove={onFloorMove ? (e) => onFloorMove(fromScene(e.point)) : undefined}
      >
        <boxGeometry args={[room.width + WALL_THICK, 0.1, room.depth + WALL_THICK]} />
        <meshStandardMaterial color={floorColor} roughness={0.9} />
      </mesh>
      {WALL_FACES.map((wall) => {
        const horizontal = wall === "north" || wall === "south";
        const n = inwardNormal(wall);
        const spans = wallSpans(size, wall, openings);
        const gaps = openings.filter((o) => o.wall === wall);
        return (
          <group
            key={wall}
            ref={(g) => {
              wallRefs.current[wall] = g;
            }}
          >
            {spans.map((span, i) => {
              const a = wallPoint(wall, span.from, size);
              const b = wallPoint(wall, span.to, size);
              const len = horizontal ? b.x - a.x : b.z - a.z;
              if (len <= 0.01) return null;
              const mid = { x: (a.x + b.x) / 2 - (n.x * WALL_THICK) / 2, y: room.height / 2, z: (a.z + b.z) / 2 - (n.z * WALL_THICK) / 2 };
              return (
                <mesh
                  key={`${wall}-${i}`}
                  position={toScene(mid)}
                  userData={{ wall }}
                  onClick={handler(wall, onWallClick)}
                  onPointerMove={handler(wall, onWallMove)}
                >
                  <boxGeometry args={horizontal ? [len, room.height, WALL_THICK] : [WALL_THICK, room.height, len]} />
                  <meshStandardMaterial color={colors.wall} roughness={0.85} />
                </mesh>
              );
            })}
            {/* Lintels over every opening. Doors get a frame and an open door
                leaf; archways stay a plain open gap. */}
            {gaps.map((o) => {
              const w = openingWidthM(o, size);
              const c = wallPoint(wall, o.wall_offset ?? 0.5, size);
              const top = lintelHeight(o, room);
              const lintelH = room.height - top;
              const base = { x: c.x - (n.x * WALL_THICK) / 2, z: c.z - (n.z * WALL_THICK) / 2 };
              const along = horizontal ? { x: 1, z: 0 } : { x: 0, z: 1 };
              const at = (a: number, inward: number, y: number) =>
                toScene({ x: base.x + along.x * a + n.x * inward, y, z: base.z + along.z * a + n.z * inward });
              const J = 0.08; // jamb / trim thickness
              const box = (alongLen: number, h: number, depth: number): [number, number, number] =>
                horizontal ? [alongLen, h, depth] : [depth, h, alongLen];
              return (
                <group key={o.id}>
                  {lintelH > 0.02 && (
                    <mesh position={toScene({ x: base.x, y: top + lintelH / 2, z: base.z })} raycast={noRaycast}>
                      <boxGeometry args={horizontal ? [w, lintelH, WALL_THICK] : [WALL_THICK, lintelH, w]} />
                      <meshStandardMaterial color={colors.wall} roughness={0.85} />
                    </mesh>
                  )}
                  {o.kind === "door" && (
                    <>
                      {[-1, 1].map((side) => (
                        <mesh key={side} position={at(side * (w / 2 - J / 2), 0, top / 2)} raycast={noRaycast}>
                          <boxGeometry args={box(J, top, WALL_THICK + 0.05)} />
                          <meshStandardMaterial color={colors.door} roughness={0.6} />
                        </mesh>
                      ))}
                      <mesh position={at(0, 0, top - J / 2)} raycast={noRaycast}>
                        <boxGeometry args={box(w, J, WALL_THICK + 0.05)} />
                        <meshStandardMaterial color={colors.door} roughness={0.6} />
                      </mesh>
                      {/* door leaf, hinged at one jamb and swung open into the room */}
                      <mesh position={at(-w / 2 + J + 0.02, WALL_THICK / 2 + (w - 2 * J) / 2, (top - J) / 2)} raycast={noRaycast}>
                        <boxGeometry args={box(0.04, top - J - 0.02, w - 2 * J)} />
                        <meshStandardMaterial color={colors.door} roughness={0.7} />
                      </mesh>
                    </>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

export interface MarkerLocus {
  locus: Locus;
}

/** Numbered locus markers (study order) with an optional path between them. */
export function LocusMarkers({
  room,
  loci,
  colors,
  selectedId,
  showPath = true,
  showLabels = true,
  draggingId,
  onMarkerDown,
  onMarkerClick,
  cardCounts,
}: {
  room: Room;
  /** Flashcards per locus id: drawn as a count badge and a small card stack beside the marker. */
  cardCounts?: Record<string, number>;
  loci: Locus[];
  colors: SceneColors;
  selectedId?: string | null;
  showPath?: boolean;
  showLabels?: boolean;
  draggingId?: string | null;
  onMarkerDown?: (locus: Locus, e: ThreeEvent<PointerEvent>) => void;
  onMarkerClick?: (locus: Locus, e: ThreeEvent<MouseEvent>) => void;
}) {
  const ordered = useMemo(() => tourOrder(loci), [loci]);
  const points = useMemo(
    () =>
      ordered.map((l) => {
        const p = locusWorldPos(l, room);
        const n = inwardNormal(p.wall);
        // Float markers slightly off the wall so they never z-fight with it.
        // Yaw that turns a plane's +Z (scene) to face into the room.
        const yaw = Math.atan2(n.x, -n.z);
        return { locus: l, yaw, world: { x: p.x + n.x * 0.18, y: p.y, z: p.z + n.z * 0.18 } };
      }),
    [ordered, room]
  );
  return (
    <group>
      {showPath && points.length > 1 && (
        <Line
          points={points.map((p) => toScene({ ...p.world, y: p.world.y - 0.25 }))}
          color={colors.path}
          lineWidth={2.5}
          dashed
          dashSize={0.25}
          gapSize={0.15}
          transparent
          opacity={0.85}
          raycast={noRaycast}
        />
      )}
      {points.map(({ locus, world, yaw }, i) => {
        const active = locus.id === selectedId;
        const color = active ? colors.locusActive : colors.locus;
        const count = cardCounts?.[locus.id] ?? 0;
        return (
          <group key={locus.id} position={toScene(world)}>
            <mesh
              raycast={draggingId === locus.id ? noRaycast : undefined}
              onPointerDown={onMarkerDown ? (e) => onMarkerDown(locus, e) : undefined}
              onClick={onMarkerClick ? (e) => onMarkerClick(locus, e) : undefined}
            >
              <sphereGeometry args={[active ? 0.2 : 0.16, 24, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.7 : 0.35} />
            </mesh>
            {count > 0 && <CardStack count={count} yaw={yaw} colors={colors} />}
            {showLabels && (
              <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }} position={[0, 0.42, 0]}>
                <div
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-md ${
                    active ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {i + 1}
                  {locus.label ? ` · ${locus.label}` : ""}
                  {cardCounts && (
                    <span
                      className={`ml-1.5 inline-block min-w-[1.25rem] rounded-full px-1 text-center text-[10px] leading-4 ${count ? "bg-background text-foreground" : "bg-background/40 opacity-80"}`}
                      title={`${count} flashcard${count === 1 ? "" : "s"}`}
                    >
                      {count}
                    </span>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Up to five thin cards fanned beside a locus marker, facing into the room. */
function CardStack({ count, yaw, colors }: { count: number; yaw: number; colors: SceneColors }) {
  const n = Math.min(count, 5);
  return (
    <group rotation={[0, yaw, 0]}>
      {Array.from({ length: n }, (_, k) => (
        <mesh
          key={k}
          raycast={noRaycast}
          position={[0.46 + k * 0.025, -0.08 + k * 0.05, 0.02 + k * 0.014]}
          rotation={[0, 0, (k % 2 ? -1 : 1) * 0.05 * k]}
        >
          <boxGeometry args={[0.38, 0.26, 0.01]} />
          <meshStandardMaterial color={k === n - 1 ? colors.locusActive : "#f4f1e8"} emissive={k === n - 1 ? colors.locusActive : "#000000"} emissiveIntensity={k === n - 1 ? 0.25 : 0} />
        </mesh>
      ))}
    </group>
  );
}

export function SceneLights({ colors }: { colors: SceneColors }) {
  return (
    <>
      <hemisphereLight args={[colors.sky, colors.floor, 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 14, 6]} intensity={1.0} />
    </>
  );
}
