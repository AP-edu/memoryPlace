"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { Locus, Opening, Room, WallFace } from "@/types/database";
import { locusWorldPos, openingWidthM, wallPoint } from "@/lib/geometry";
import { wallSpans } from "@/lib/walk";
import { cutawayWalls, fromScene, inwardNormal, toScene, tourOrder, WALL_FACES } from "@/lib/scene3d";
import type { SceneColors } from "./useSceneColors";
import { isHallway } from "@/lib/hallway";
import { furnitureOf, type FurnitureItem } from "@/lib/furniture";
import { RoomFurniture } from "./Furniture";

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

const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** Room palette: walls take a light wash of the room's colour so rooms read apart. */
function roomPalette(room: Room, colors: SceneColors, hallway: boolean) {
  const tint = room.background ?? (hallway ? colors.archway : null);
  const wall = tint ? mix(colors.wall, tint, colors.night ? 0.22 : 0.16) : colors.wall;
  return {
    wall,
    floor: tint ? mix(colors.floor, tint, hallway && !room.background ? 0.18 : 0.35) : colors.floor,
    // Skirting and a gold-washed cornice draw the corners and the floor line.
    skirting: mix(wall, "#000000", colors.night ? 0.35 : 0.3),
    cornice: mix(wall, colors.door, colors.night ? 0.35 : 0.3),
  };
}

const tileCanvases = new Map<string, HTMLCanvasElement>();
/** 2x2 marble tiles with grout lines (one texture repeat = 2 m), cached per colour. */
function tileCanvas(floor: string): HTMLCanvasElement {
  let c = tileCanvases.get(floor);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const base = new THREE.Color(floor);
  const tone = (t: number) => "#" + base.clone().lerp(new THREE.Color(t > 0 ? "#ffffff" : "#000000"), Math.abs(t)).getHexString();
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = tone((i + j) % 2 ? -0.035 : 0.025);
      g.fillRect(i * 128, j * 128, 128, 128);
    }
  g.fillStyle = tone(-0.16);
  for (const p of [0, 128]) {
    g.fillRect(p, 0, 3, 256);
    g.fillRect(0, p, 256, 3);
  }
  tileCanvases.set(floor, c);
  return c;
}

function useFloorTexture(floor: string, width: number, depth: number): THREE.Texture | null {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const t = new THREE.CanvasTexture(tileCanvas(floor));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(width / 2, depth / 2);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [floor, width, depth]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/**
 * A door leaf hinged at `hinge` (scene coords). Closed it fills the opening
 * along the wall; open it has swung 90° into the room. With `animate` it
 * opens when the camera comes within reach and eases shut behind you.
 */
function DoorLeaf({
  hinge,
  center,
  along,
  inward,
  length,
  height,
  color,
  animate,
}: {
  hinge: [number, number, number];
  center: [number, number, number];
  along: [number, number, number];
  inward: [number, number, number];
  length: number;
  height: number;
  color: string;
  animate: boolean;
}) {
  const pivot = useRef<THREE.Group>(null);
  const open = useRef(animate ? 0 : 1);
  // Y rotation taking the closed direction (along the wall) to the open one (into the room).
  const fullOpen = Math.atan2(along[2] * inward[0] - along[0] * inward[2], along[0] * inward[0] + along[2] * inward[2]);
  useFrame(({ camera }, dt) => {
    const p = pivot.current;
    if (!p) return;
    let target = 1;
    if (animate) {
      const dx = camera.position.x - center[0];
      const dz = camera.position.z - center[2];
      target = dx * dx + dz * dz < 2.6 * 2.6 ? 1 : 0;
    }
    open.current += (target - open.current) * Math.min(1, dt * 3.5);
    p.rotation.y = fullOpen * open.current;
  });
  const alongX = Math.abs(along[0]) > Math.abs(along[2]);
  return (
    <group ref={pivot} position={[hinge[0], height / 2 + 0.01, hinge[2]]}>
      <mesh position={[(along[0] * length) / 2, 0, (along[2] * length) / 2]} raycast={noRaycast}>
        <boxGeometry args={alongX ? [length, height, 0.04] : [0.04, height, length]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

const SKIRT_H = 0.14;
const CORNICE_H = 0.12;

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
  furniture,
  furnitureSelectedId,
  furnitureDraggingId,
  onFurnitureDown,
  onFurnitureClick,
  animateDoors = false,
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
  /** Live furniture (the studio's unsaved edits); defaults to the room's saved metadata. */
  furniture?: FurnitureItem[];
  furnitureSelectedId?: string | null;
  furnitureDraggingId?: string | null;
  onFurnitureDown?: (item: FurnitureItem, e: ThreeEvent<PointerEvent>) => void;
  onFurnitureClick?: (item: FurnitureItem, e: ThreeEvent<MouseEvent>) => void;
  /** Walk mode: door leaves swing open as the camera approaches and close behind it. */
  animateDoors?: boolean;
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
        // Doorway hit boxes stay invisible; they only stop taking clicks when faded.
        if (mesh.userData.hit) {
          mesh.raycast = hidden ? noRaycast : THREE.Mesh.prototype.raycast;
          return;
        }
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

  // Room colour tints floor and walls so each room reads as its own place, in
  // light and dark. Hallways get a cooler, path-coloured floor.
  const hallway = isHallway(room);
  const palette = useMemo(() => roomPalette(room, colors, hallway), [room, colors, hallway]);
  const floorTex = useFloorTexture(palette.floor, room.width + WALL_THICK, room.depth + WALL_THICK);
  const savedFurniture = useMemo(() => furnitureOf(room), [room]);

  return (
    <group>
      <RoomFurniture
        items={furniture ?? savedFurniture}
        roomHeight={room.height}
        selectedId={furnitureSelectedId}
        draggingId={furnitureDraggingId}
        highlight={colors.locusActive}
        onItemDown={onFurnitureDown}
        onItemClick={onFurnitureClick}
      />
      <mesh
        position={toScene({ x: room.width / 2, y: -0.05, z: room.depth / 2 })}
        raycast={floorRaycast ? THREE.Mesh.prototype.raycast : noRaycast}
        onPointerMove={onFloorMove ? (e) => onFloorMove(fromScene(e.point)) : undefined}
      >
        <boxGeometry args={[room.width + WALL_THICK, 0.1, room.depth + WALL_THICK]} />
        <meshStandardMaterial color="#ffffff" map={floorTex} roughness={0.75} />
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
                  <meshStandardMaterial color={palette.wall} roughness={0.85} />
                </mesh>
              );
            })}
            {/* Skirting along each solid span (it stops at doorways). */}
            {spans.map((span, i) => {
              const a = wallPoint(wall, span.from, size);
              const b = wallPoint(wall, span.to, size);
              const len = horizontal ? b.x - a.x : b.z - a.z;
              if (len <= 0.01) return null;
              const d = 0.035;
              const mid = { x: (a.x + b.x) / 2 + (n.x * d) / 2, y: SKIRT_H / 2, z: (a.z + b.z) / 2 + (n.z * d) / 2 };
              return (
                <mesh key={`skirt-${wall}-${i}`} position={toScene(mid)} raycast={noRaycast}>
                  <boxGeometry args={horizontal ? [len, SKIRT_H, d] : [d, SKIRT_H, len]} />
                  <meshStandardMaterial color={palette.skirting} roughness={0.7} />
                </mesh>
              );
            })}
            {/* Cornice along the whole wall, over the lintels too. */}
            {(() => {
              const len = horizontal ? room.width : room.depth;
              const c = wallPoint(wall, 0.5, size);
              const d = 0.05;
              const mid = { x: c.x + (n.x * d) / 2, y: room.height - CORNICE_H / 2, z: c.z + (n.z * d) / 2 };
              return (
                <mesh position={toScene(mid)} raycast={noRaycast}>
                  <boxGeometry args={horizontal ? [len, CORNICE_H, d] : [d, CORNICE_H, len]} />
                  <meshStandardMaterial color={palette.cornice} roughness={0.55} metalness={0.15} />
                </mesh>
              );
            })()}
            {/* Invisible hit boxes over doorways: clicks there reach the editor so
                it can say "that's a doorway" instead of silently doing nothing. */}
            {(onWallClick || onWallMove) &&
              gaps.map((o) => {
                const w = openingWidthM(o, size);
                const c = wallPoint(wall, o.wall_offset ?? 0.5, size);
                const mid = { x: c.x - (n.x * WALL_THICK) / 2, y: room.height / 2, z: c.z - (n.z * WALL_THICK) / 2 };
                return (
                  <mesh
                    key={`hit-${o.id}`}
                    position={toScene(mid)}
                    userData={{ wall, hit: true }}
                    onClick={handler(wall, onWallClick)}
                    onPointerMove={handler(wall, onWallMove)}
                  >
                    <boxGeometry args={horizontal ? [w, room.height, WALL_THICK] : [WALL_THICK, room.height, w]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
                      <meshStandardMaterial color={palette.wall} roughness={0.85} />
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
                      {/* door leaf, hinged at one jamb; swings open as you approach in walk mode */}
                      <DoorLeaf
                        hinge={at(-w / 2 + J, WALL_THICK / 2, 0)}
                        center={at(0, WALL_THICK / 2, 0)}
                        along={toScene({ x: along.x, y: 0, z: along.z })}
                        inward={toScene({ x: n.x, y: 0, z: n.z })}
                        length={w - 2 * J}
                        height={top - J - 0.02}
                        color={colors.door}
                        animate={animateDoors}
                      />
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

/** Plaques sit just proud of the wall (no z-fighting), facing into the room. */
export const PLAQUE_OFFSET = 0.05;
const PLAQUE_R = 0.19;
const PATH_INSET = 0.45;
const RECALLED = "#2f9e44";
const MISSED = "#e03131";

const faceTextures = new Map<string, THREE.CanvasTexture>();
/** Medallion face: the study-order number on the locus colour (cached per number + colour). */
function plaqueFace(label: string, bg: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const key = `${label}|${bg}`;
  const hit = faceTextures.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const bgColor = new THREE.Color(bg);
  g.fillStyle = "#" + bgColor.getHexString();
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  const light = bgColor.r * 0.2126 + bgColor.g * 0.7152 + bgColor.b * 0.0722 > 0.45;
  g.strokeStyle = light ? "rgba(11,22,64,0.25)" : "rgba(255,255,255,0.35)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = light ? "#0b1640" : "#ffffff";
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  g.font = `700 ${label.length > 2 ? 42 : label.length > 1 ? 54 : 62}px ${family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faceTextures.set(key, t);
  return t;
}

/** Framed medallion mounted on the wall: the locus itself (and its drag handle in the editor). */
function Plaque({
  label,
  face,
  frame,
  active,
  ghost,
  pulseAt,
  raycast,
  onPointerDown,
  onClick,
}: {
  label: string;
  face: string;
  frame: string;
  active: boolean;
  ghost?: boolean;
  /** performance.now() of the last arrival here: the plaque gives a short pulse. */
  pulseAt?: number | null;
  raycast: THREE.Mesh["raycast"];
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const tex = useMemo(() => plaqueFace(label, face), [label, face]);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    let s = active ? 1.15 : 1;
    if (pulseAt != null) {
      const t = (performance.now() - pulseAt) / 650;
      if (t >= 0 && t < 1) s *= 1 + 0.35 * Math.sin(Math.PI * t) * (1 - t);
    }
    g.scale.setScalar(s);
  });
  // Never leave the hover cursor behind if a hovered plaque goes away.
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    []
  );
  return (
    <group ref={group}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        raycast={raycast}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onPointerOver={onClick || onPointerDown ? () => (document.body.style.cursor = "pointer") : undefined}
        onPointerOut={onClick || onPointerDown ? () => (document.body.style.cursor = "") : undefined}
      >
        <cylinderGeometry args={[PLAQUE_R, PLAQUE_R, 0.04, 40]} />
        <meshStandardMaterial
          color={frame}
          emissive={frame}
          emissiveIntensity={active ? 0.5 : 0.1}
          metalness={0.35}
          roughness={0.4}
          transparent={ghost}
          opacity={ghost ? 0.65 : 1}
        />
      </mesh>
      <mesh position={[0, 0, 0.021]} raycast={noRaycast}>
        <circleGeometry args={[PLAQUE_R * 0.84, 40]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={active ? 0.6 : 0.32}
          roughness={0.6}
          transparent={ghost}
          opacity={ghost ? 0.65 : 1}
        />
      </mesh>
    </group>
  );
}

/** Html label that fades out beyond `fade` metres from the camera (unless pinned). */
function MarkerLabel({ fade, pinned, children }: { fade?: number; pinned: boolean; children: React.ReactNode }) {
  const anchor = useRef<THREE.Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const tmp = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    if (!fade || !anchor.current || !el.current) return;
    const d = anchor.current.getWorldPosition(tmp.current).distanceTo(camera.position);
    el.current.style.opacity = pinned ? "1" : String(Math.max(0, Math.min(1, (fade - d) / 1.5)));
  });
  return (
    <group ref={anchor} position={[0, 0.42, 0]}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div ref={el} className="transition-opacity duration-200">
          {children}
        </div>
      </Html>
    </group>
  );
}

/** Numbered locus plaques (study order) with an optional path between them. */
export function LocusMarkers({
  room,
  loci,
  colors,
  selectedId,
  showPath = true,
  showLabels = true,
  labelFade,
  ghost = false,
  results,
  pulse,
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
  /** Walk mode: labels fade out beyond this many metres (the selected one stays). */
  labelFade?: number;
  /** Placement preview in the editor: translucent "+" plaque. */
  ghost?: boolean;
  /** Tour grades per locus id: recalled plaques turn green, missed ones red. */
  results?: Record<string, boolean> | null;
  /** Arrival pulse: which plaque, and when (performance.now()). */
  pulse?: { id: string; at: number } | null;
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
        // Yaw that turns a plane's +Z (scene) to face into the room.
        const yaw = Math.atan2(n.x, -n.z);
        return {
          locus: l,
          yaw,
          world: { x: p.x + n.x * PLAQUE_OFFSET, y: p.y, z: p.z + n.z * PLAQUE_OFFSET },
          // The study route is drawn on the floor, a step in from each plaque.
          floor: { x: p.x + n.x * PATH_INSET, y: 0.03, z: p.z + n.z * PATH_INSET },
        };
      }),
    [ordered, room]
  );
  return (
    <group>
      {showPath && points.length > 1 && (
        <Line
          points={points.map((p) => toScene(p.floor))}
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
        const count = cardCounts?.[locus.id] ?? 0;
        return (
          <group key={locus.id} position={toScene(world)}>
            <group rotation={[0, yaw, 0]}>
              <Plaque
                label={ghost ? "+" : String(i + 1)}
                face={
                  active || ghost
                    ? colors.locusActive
                    : results?.[locus.id] === true
                      ? RECALLED
                      : results?.[locus.id] === false
                        ? MISSED
                        : colors.locus
                }
                frame={colors.door}
                active={active}
                ghost={ghost}
                pulseAt={pulse?.id === locus.id ? pulse.at : null}
                // Restore explicitly: R3F ignores `undefined` props, which left a marker unpickable after its first drag.
                raycast={draggingId === locus.id ? noRaycast : THREE.Mesh.prototype.raycast}
                onPointerDown={onMarkerDown ? (e) => onMarkerDown(locus, e) : undefined}
                onClick={onMarkerClick ? (e) => onMarkerClick(locus, e) : undefined}
              />
            </group>
            {count > 0 && <CardStack count={count} yaw={yaw} colors={colors} />}
            {showLabels && (
              <MarkerLabel fade={labelFade} pinned={active}>
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
              </MarkerLabel>
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
          position={[0.42 + k * 0.025, -0.08 + k * 0.05, 0.01 + k * 0.012]}
          rotation={[0, 0, (k % 2 ? -1 : 1) * 0.05 * k]}
        >
          <boxGeometry args={[0.38, 0.26, 0.01]} />
          <meshStandardMaterial color={k === n - 1 ? colors.locusActive : "#f4f1e8"} emissive={k === n - 1 ? colors.locusActive : "#000000"} emissiveIntensity={k === n - 1 ? 0.25 : 0} />
        </mesh>
      ))}
    </group>
  );
}

// Lighting comes from the palette (--scene-key/-fill/-hemi/-boost): warm sun
// over marble, cool moonlight, a candlelit study... A key light from the
// south-east plus a weaker fill from the north-west give all four wall
// orientations a different shade; ambient stays low (flat ambient is what
// made every wall the same grey).
export function SceneLights({ colors }: { colors: SceneColors }) {
  const b = Number.parseFloat(colors.boost) || 1;
  return colors.night ? (
    <>
      <hemisphereLight args={[colors.hemi, colors.floor, 0.9 * b]} />
      <ambientLight intensity={0.35 * b} color={colors.hemi} />
      {/* From the moon's side of the sky (see SceneSky). */}
      <directionalLight position={[6, 9, -8]} intensity={1.6 * b} color={colors.key} />
      <directionalLight position={[-5, 6, 7]} intensity={0.45 * b} color={colors.fill} />
    </>
  ) : (
    <>
      <hemisphereLight args={[colors.hemi, colors.floor, 0.95 * b]} />
      <ambientLight intensity={0.25 * b} />
      <directionalLight position={[7, 12, 4.5]} intensity={2.3 * b} color={colors.key} />
      <directionalLight position={[-4, 7, -8]} intensity={0.6 * b} color={colors.fill} />
    </>
  );
}
