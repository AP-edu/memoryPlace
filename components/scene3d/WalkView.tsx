"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { Card, Locus, Opening, Room } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";
import { wallPoint } from "@/lib/geometry";
import {
  EYE_HEIGHT,
  PLAYER_RADIUS,
  WALK_SPEED,
  focusLocus,
  forwardVec,
  isOutside,
  spawnPose,
  stepPlayer,
  toWorldLoci,
  type MoveInput,
  type Pose,
  type WorldLocus,
} from "@/lib/walk";
import {
  buildTourStops,
  navArrows,
  navStep,
  navStops,
  orderTourStopsByCards,
  stopPose,
  type NavArrow,
  type NavStop,
  easeInOut,
  exitThroughDoor,
  inwardNormal,
  lerpPose,
  returnDoor,
  spawnAtDoor,
  toScene,
  tourOrder,
  viewPoseForLocus,
  type TourStop,
} from "@/lib/scene3d";
import { LocusMarkers, RoomShell, SceneLights } from "./RoomShell";
import { SceneSky } from "./SceneSky";
import { SceneGate } from "./SceneBoundary";
import Markdown from "@/components/Markdown";
import { stripMarkdown } from "@/lib/markdownEdit";
import { useSceneColors } from "./useSceneColors";
import { buildChoices } from "@/lib/quiz";
import type { SessionAnswer } from "@/lib/reviewTypes";
import type { Blueprint } from "@/lib/blueprint";
import MiniMap, { type MiniMapPose } from "./MiniMap";
import { blockers, furnitureOf, obstacles } from "@/lib/furniture";
import { readSoundOn, setSoundOn, subscribeSound } from "@/lib/sound";
import { playChime } from "./chime";
import { FloorShadows, SceneFX } from "./SceneFX";
import { PerformanceMonitor } from "@react-three/drei";
import { Building2, Footprints, Volume2, VolumeX } from "lucide-react";
import {
  aerialView,
  carryPose,
  doorBetween,
  doorPassage,
  roomOffset,
  sameLevel,
  sharedSpans,
  twinFramedOpenings,
  type RoomTally,
} from "@/lib/building";

// First-person walk mode + guided tour. Movement/collision/focus/tour maths
// live in lib/walk.ts and lib/scene3d.ts (pure, unit-tested); this file is
// rendering and input only.

const GLIDE_S = 0.9;
type Stop = TourStop<Locus, Card>;

interface Glide {
  from: Pose;
  to: Pose;
  t: number;
  /** Set when the glide ends at a locus (drives the arrival beat). */
  locusId?: string;
  /** A second leg glided straight after this one (through a doorway). */
  next?: Pose;
  /** Runs when the last leg lands (e.g. step into the next room). */
  onDone?: () => void;
}

/**
 * Bird's-eye blend: 0 = eye level, 1 = high over the whole level looking
 * down (the blueprint as a model). The fly-in starts at 1 and descends; the
 * Overview button rises back up. `p` eases toward `target`.
 */
interface Aerial {
  p: number;
  target: 0 | 1;
}
/** Seconds between eye level and the bird's-eye view. */
const AERIAL_S = 1.7;
const AERIAL_PITCH = -1.45;
/** Eye-level lens, and a long lens from the air (an architect's model, not a fisheye). */
const WALK_FOV = 62;
const AERIAL_FOV = 36;
const FOG = { near: 12, far: 40 };

function PlayerRig({
  room,
  openings,
  items,
  poseRef,
  inputRef,
  joyRef,
  lookRef,
  glideRef,
  frozen,
  aerialRef,
  overhead,
  onArrive,
  onFocus,
  onExit,
  onNearDoor,
}: {
  room: Room;
  openings: Opening[];
  items: WorldLocus[];
  poseRef: React.MutableRefObject<Pose>;
  inputRef: React.MutableRefObject<MoveInput>;
  joyRef: React.MutableRefObject<MoveInput>;
  lookRef: React.MutableRefObject<{ yawDelta: number; pitchDelta: number }>;
  glideRef: React.MutableRefObject<Glide | null>;
  frozen: boolean;
  aerialRef: React.MutableRefObject<Aerial>;
  /** Where the bird's-eye camera hangs (this room's frame) and how high. */
  overhead: { x: number; z: number; h: number };
  onArrive?: (locusId: string) => void;
  onFocus: (id: string | null) => void;
  onExit: (o: Opening) => void;
  onNearDoor: (o: Opening | null) => void;
}) {
  const size = { width: room.width, depth: room.depth };
  // Solid furniture blocks walking (rugs don't).
  const blocks = useMemo(() => obstacles(furnitureOf(room)), [room]);
  const lastFocus = useRef<string | null>(null);
  const lastNear = useRef<string | null>(null);
  const exited = useRef(false);
  useFrame(({ camera, scene }, delta) => {
    let pose = poseRef.current;
    const glide = glideRef.current;
    if (glide) {
      glide.t = Math.min(1, glide.t + delta / GLIDE_S);
      pose = lerpPose(glide.from, glide.to, easeInOut(glide.t));
      if (glide.t >= 1) {
        if (glide.next) {
          glideRef.current = { from: glide.to, to: glide.next, t: 0, locusId: glide.locusId, onDone: glide.onDone };
        } else {
          glideRef.current = null;
          if (glide.locusId) onArrive?.(glide.locusId);
          glide.onDone?.();
        }
      }
    } else {
      pose = {
        ...pose,
        yaw: pose.yaw + lookRef.current.yawDelta,
        pitch: Math.min(1.2, Math.max(-1.2, pose.pitch + lookRef.current.pitchDelta)),
      };
      if (!frozen) {
        const k = inputRef.current;
        const j = joyRef.current;
        const input = {
          throttle: Math.max(-1, Math.min(1, k.throttle + j.throttle)),
          strafe: Math.max(-1, Math.min(1, k.strafe + j.strafe)),
        };
        pose = stepPlayer(pose, input, delta, size, openings, { speed: WALK_SPEED, radius: PLAYER_RADIUS, obstacles: blocks });
      }
    }
    lookRef.current.yawDelta = 0;
    lookRef.current.pitchDelta = 0;
    poseRef.current = pose;

    // Bird's-eye blend: the fly-in descends from over the whole level (the
    // blueprint becomes the place); Overview rises back up to it.
    const air = aerialRef.current;
    if (air.p !== air.target) {
      const step = delta / AERIAL_S;
      air.p = air.target > air.p ? Math.min(1, air.p + step) : Math.max(0, air.p - step);
    }
    const flying = air.p > 0;
    let cam = { x: pose.x, y: EYE_HEIGHT, z: pose.z };
    let yaw = pose.yaw;
    let pitch = pose.pitch;
    if (flying) {
      const e = easeInOut(air.p);
      let dy = -pose.yaw; // north up from the air, like every plan
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      cam = { x: pose.x + (overhead.x - pose.x) * e, y: EYE_HEIGHT + (overhead.h - EYE_HEIGHT) * e, z: pose.z + (overhead.z - pose.z) * e };
      yaw = pose.yaw + dy * e;
      pitch = pose.pitch + (AERIAL_PITCH - pose.pitch) * e;
    }
    // Keep the far plane and fog beyond the whole building while high up.
    const reach = Math.max(1, cam.y / 4);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = FOG.near * reach;
      scene.fog.far = FOG.far * reach;
    }
    const far = Math.max(120, cam.y * 3);
    const fov = flying ? WALK_FOV + (AERIAL_FOV - WALK_FOV) * easeInOut(air.p) : WALK_FOV;
    const pc = camera as THREE.PerspectiveCamera;
    if (Math.abs(pc.far - far) > 1 || Math.abs(pc.fov - fov) > 0.01) {
      pc.far = far;
      pc.fov = fov;
      pc.updateProjectionMatrix();
    }
    const f = forwardVec(yaw, pitch);
    camera.position.set(...toScene(cam));
    camera.lookAt(...toScene({ x: cam.x + f.x, y: cam.y + f.y, z: cam.z + f.z }));

    if (!frozen && !flying && !glideRef.current) {
      const hit = focusLocus({ x: pose.x, y: EYE_HEIGHT, z: pose.z, yaw: pose.yaw, pitch: pose.pitch }, items);
      const id = hit ? hit.locus.id : null;
      if (id !== lastFocus.current) {
        lastFocus.current = id;
        onFocus(id);
      }
      // Linked doors: walking out through one moves you to the neighbour.
      const out = exitThroughDoor(pose, size, openings, 1.5);
      if (out && !exited.current) {
        exited.current = true;
        onExit(out);
      } else if (!out && !isOutside(pose, size)) {
        exited.current = false;
      }
    }
    // "Go to <room>" prompt when standing at a linked door.
    let near: Opening | null = null;
    for (const o of openings) {
      if (!o.target_room_id) continue;
      const p = wallPoint(o.wall, o.wall_offset ?? 0.5, size);
      // Hysteresis: appear at 2.0 m, only disappear past 2.6 m, so the prompt
      // doesn't flicker when you hover at the edge of the radius.
      const radius = lastNear.current === o.id ? 2.6 : 2.0;
      if (Math.hypot(p.x - pose.x, p.z - pose.z) < radius) near = o;
    }
    const nearId = near?.id ?? null;
    if (nearId !== lastNear.current) {
      lastNear.current = nearId;
      onNearDoor(near);
    }
  });
  return null;
}

/** Labels over linked doors naming the neighbouring room. */
function DoorSigns({ room, openings, roomTitles }: { room: Room; openings: Opening[]; roomTitles: Record<string, string> }) {
  return (
    <>
      {openings
        .filter((o) => o.target_room_id)
        .map((o) => {
          const p = wallPoint(o.wall, o.wall_offset ?? 0.5, room);
          const n = inwardNormal(o.wall);
          const y = o.kind === "door" ? Math.min(2.1, room.height - 0.1) + 0.2 : room.height - 0.2;
          return (
            <Html key={o.id} center position={toScene({ x: p.x + n.x * 0.2, y, z: p.z + n.z * 0.2 })} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground shadow">
                {"\u2192 "}
                {roomTitles[o.target_room_id as string] ?? "Next room"}
              </div>
            </Html>
          );
        })}
    </>
  );
}

/** Overview: a label over every room on the level; pick one to fly down into it. */
function OverviewLabels({
  rooms,
  origin,
  currentId,
  tally,
  lociCount,
  onPick,
}: {
  rooms: Room[];
  origin: Room;
  currentId: string;
  tally?: Record<string, RoomTally>;
  lociCount: (roomId: string) => number;
  onPick: (roomId: string) => void;
}) {
  return (
    <>
      {rooms.map((r) => {
        const o = roomOffset(r, origin);
        const t = tally?.[r.id];
        const here = r.id === currentId;
        const n = lociCount(r.id);
        return (
          <Html key={r.id} center position={toScene({ x: o.x + r.width / 2, y: r.height + 0.2, z: o.z + r.depth / 2 })} zIndexRange={[20, 0]}>
            <button
              type="button"
              onClick={() => onPick(r.id)}
              aria-label={here ? `${r.title} (you are here)` : `Go to ${r.title}`}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-md transition-colors ${
                here ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {r.title}
              <span className="ml-1.5 font-normal opacity-80">
                {here ? "\u00b7 you are here" : t && t.due > 0 ? `\u00b7 ${t.due} due` : `\u00b7 ${n} loc${n === 1 ? "us" : "i"}`}
              </span>
            </button>
          </Html>
        );
      })}
    </>
  );
}

// Flat chevron lying on the floor, pointing along +y in shape space (= north
// after laying it down); the group's yaw turns it toward its target.
const CHEVRON = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.42);
  sh.lineTo(0.36, 0.02);
  sh.lineTo(0.22, -0.1);
  sh.lineTo(0, 0.14);
  sh.lineTo(-0.22, -0.1);
  sh.lineTo(-0.36, 0.02);
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
})();

const NAV_PITCH = -0.3;

function NavChevrons({
  arrows,
  stops,
  roomTitles,
  colors,
  onGo,
}: {
  arrows: NavArrow[];
  stops: Array<NavStop<Locus>>;
  roomTitles: Record<string, string>;
  colors: { locus: string; door: string; locusActive: string };
  onGo: (index: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <>
      {arrows.map((a) => {
        const s = stops[a.stopIndex];
        if (!s) return null; // arrows from the room you just left, until the next tick
        const color = a.role === "door" ? colors.door : a.role === "next" ? colors.locus : colors.locus;
        const label =
          s.kind === "door"
            ? `\u2192 ${roomTitles[s.targetRoomId] ?? "Next room"}`
            : `${a.role === "prev" ? "Back" : "Next"} \u00b7 ${s.number}${s.locus.label ? ` ${s.locus.label}` : ""}`;
        const hot = hover === a.stopIndex;
        return (
          <group key={a.stopIndex} position={toScene({ x: a.x, y: 0.03, z: a.z })} rotation={[0, -a.yaw, 0]}>
            <mesh
              geometry={CHEVRON}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={hot ? 1.25 : 1}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHover(a.stopIndex);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHover(null);
                document.body.style.cursor = "";
              }}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                if (e.delta > 6) return; // that was a look-drag
                e.stopPropagation();
                document.body.style.cursor = "";
                onGo(a.stopIndex);
              }}
            >
              <meshBasicMaterial color={hot ? colors.locusActive : color} transparent opacity={a.role === "prev" ? 0.6 : 0.92} side={THREE.DoubleSide} />
            </mesh>
            {/* bigger invisible hit area */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={(e: ThreeEvent<MouseEvent>) => {
              if (e.delta > 6) return;
              e.stopPropagation();
              onGo(a.stopIndex);
            }}>
              <circleGeometry args={[0.55, 20]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Html center position={[0, 0.35, 0]} zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
              <div className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow ${a.role === "door" ? "bg-accent text-accent-foreground" : "bg-card/90 text-foreground"} ${hot ? "ring-2 ring-ring" : ""}`}>
                {label}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

/**
 * Touch joystick (coarse pointers only). `hidden` (a bottom card is open) takes
 * effect on release, so a card that opens mid-push never yanks the stick from
 * under the thumb.
 */
function Joystick({ joyRef, hidden = false }: { joyRef: React.MutableRefObject<MoveInput>; hidden?: boolean }) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const R = 48;
  function update(e: React.PointerEvent) {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    joyRef.current = { throttle: -dy / R, strafe: dx / R };
  }
  function end() {
    origin.current = null;
    setKnob(null);
    joyRef.current = { throttle: 0, strafe: 0 };
  }
  // Never leave a push behind when the stick unmounts (route change mid-drag).
  useEffect(
    () => () => {
      joyRef.current = { throttle: 0, strafe: 0 };
    },
    [joyRef]
  );
  if (hidden && !knob) return null;
  return (
    <div
      aria-label="Move joystick"
      className="absolute bottom-6 left-6 hidden h-32 w-32 touch-none select-none items-center justify-center rounded-full border border-border bg-card/60 backdrop-blur pointer-coarse:flex"
      onPointerDown={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
        update(e);
      }}
      onPointerMove={update}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="h-12 w-12 rounded-full bg-primary/80 shadow-lg"
        style={{ transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)` }}
      />
    </div>
  );
}

/** The whole palace, for walking it as one building. */
export interface WalkWorld {
  rooms: Room[];
  openings: Opening[];
  loci: Locus[];
  /** Level that rooms with a null level_id belong to. */
  fallbackLevelId?: string | null;
  /** Cards / due per room, shown on the overview labels. */
  tally?: Record<string, RoomTally>;
}

/** A room a palace tour can continue to. */
export interface NextRoom {
  id: string;
  title: string;
  due: number;
  cards: number;
}

export interface WalkViewProps {
  room: Room;
  loci: Locus[];
  openings: Opening[];
  cards: Card[];
  /** Titles of other rooms (for door signs). */
  roomTitles?: Record<string, string>;
  /** Spawn pose (e.g. just inside the door you came through). */
  spawn?: Pose | null;
  /** Called when the player walks through a linked door. */
  onExitDoor?: (opening: Opening) => void;
  /** Record a tour answer (e.g. POST /api/reviews). */
  onGrade?: (card: Card, correct: boolean) => void | Promise<void>;
  /**
   * Called once when a tour finishes with the graded answers. May resolve to a
   * href for the full session summary (shown as a button on the tour card).
   */
  onTourComplete?: (answers: SessionAnswer[], got: number, total: number) => Promise<string | null | void> | void;
  /** Top-down plan of this room's whole level; enables the live minimap. */
  levelPlan?: Blueprint | null;
  /** Minimap taps on another room / a linked door open that room. */
  onGoRoom?: (roomId: string) => void;
  /** Extra controls rendered top-right. */
  actions?: React.ReactNode;
  /** Start the guided tour immediately. */
  autoTour?: boolean;
  /** Fly down into the room on arrival (skipped for reduced motion). */
  intro?: boolean;
  /**
   * Due-first card order (card ids, e.g. from
   * `sortPlayQueue(items, "due", now)`). When provided the tour offers a
   * Due first / Walkthrough toggle; Walkthrough keeps canonical order.
   * `undefined` = still loading (an auto tour waits for it), `null` = none.
   */
  cardOrder?: string[] | null;
  /**
   * The whole palace. Rooms on this level are drawn around you, doors open
   * into them, and walking through one carries straight on: the parent swaps
   * `room` (and its loci/openings/cards) in `onEnterRoom`, no remount.
   */
  world?: WalkWorld | null;
  /** You walked or travelled into another room of `world`. */
  onEnterRoom?: (roomId: string) => void;
  /** Where a finished room tour continues: next room with due cards, or with any cards (walkthrough). */
  nextRooms?: { due: NextRoom | null; any: NextRoom | null } | null;
  className?: string;
}

export default function WalkView({
  room,
  loci,
  openings,
  cards,
  roomTitles = {},
  spawn,
  onExitDoor,
  onGrade,
  onTourComplete,
  levelPlan = null,
  onGoRoom,
  actions,
  autoTour = false,
  intro = false,
  cardOrder,
  world = null,
  onEnterRoom,
  nextRooms = null,
  className = "h-dvh",
}: WalkViewProps) {
  const colors = useSceneColors();
  // Look slightly down (Street-View style) so the floor chevrons are in view.
  const poseRef = useRef<Pose>({ ...(spawn ?? spawnPose(room)), pitch: NAV_PITCH });
  // Arrival beat: the plaque pulses and (unless muted) a soft chime plays,
  // pitched by the locus's place in the study order.
  const [pulse, setPulse] = useState<{ id: string; at: number } | null>(null);
  const sound = useSyncExternalStore(subscribeSound, readSoundOn, () => true);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const orderIndex = useMemo(() => new Map(tourOrder(loci).map((l, i) => [l.id, i])), [loci]);
  const arrive = useCallback(
    (locusId: string) => {
      setPulse({ id: locusId, at: performance.now() });
      if (soundRef.current) playChime(orderIndex.get(locusId) ?? 0);
    },
    [orderIndex]
  );
  const toggleSound = () => setSoundOn(!sound);
  // Render quality: touch devices start leaner (phone pixel densities are
  // expensive); the PerformanceMonitor in the canvas steps down further.
  const coarse = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches, []);
  const [dpr, setDpr] = useState<number | [number, number]>(() => [1, coarse ? 1.5 : 2]);
  const [fx, setFx] = useState(true);
  // Furniture the tour camera must not stand in or look through.
  const sight = useMemo(() => blockers(furnitureOf(room), room.height), [room]);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const aerialRef = useRef<Aerial>({ p: intro && !reducedMotion ? 1 : 0, target: 0 });
  const [overview, setOverview] = useState(false);
  const inputRef = useRef<MoveInput>({ throttle: 0, strafe: 0 });
  const joyRef = useRef<MoveInput>({ throttle: 0, strafe: 0 });
  const lookRef = useRef({ yawDelta: 0, pitchDelta: 0 });
  const glideRef = useRef<Glide | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});
  const [nearDoor, setNearDoor] = useState<Opening | null>(null);
  const [outside, setOutside] = useState(false);
  const [tour, setTour] = useState<{ index: number; revealed: boolean; results: Record<string, boolean> } | null>(null);
  // A running tour keeps the order it started with: a late review fetch or a
  // card refetch must never reshuffle the stops under the learner.
  const [tourStops, setTourStops] = useState<Stop[] | null>(null);
  const [summary, setSummary] = useState<{ got: number; total: number; href?: string | null } | null>(null);
  const [navIndex, setNavIndex] = useState(-1);
  const [arrows, setArrows] = useState<NavArrow[]>([]);

  // ---------------------------------------------------------------- one building
  // With `world`, every room on this level is drawn in this room's frame and
  // doors lead straight into them. Changing room swaps the `room` prop (no
  // remount): per-room state resets here, the pose is carried or respawned
  // in the layout effect below.
  const [roomKey, setRoomKey] = useState(room.id);
  if (roomKey !== room.id) {
    setRoomKey(room.id);
    setNavIndex(-1);
    setArrows([]);
    setTour(null);
    setTourStops(null);
    setSummary(null);
    setFocusedId(null);
    setDismissedId(null);
    setRevealedCards({});
    setNearDoor(null);
    setPulse(null);
    setOutside(false);
    setOverview(false);
  }
  const levelRooms = useMemo(() => {
    if (!world) return [room];
    return [room, ...sameLevel(world.rooms, room, world.fallbackLevelId ?? null).filter((r) => r.id !== room.id)];
  }, [world, room]);
  const neighbours = useMemo(
    () =>
      world
        ? levelRooms.slice(1).map((r) => ({
            room: r,
            offset: roomOffset(r, room),
            openings: world.openings.filter((o) => o.room_id === r.id),
            loci: world.loci.filter((l) => l.room_id === r.id),
          }))
        : [],
    [world, levelRooms, room]
  );
  const shared = useMemo(() => new Map(levelRooms.map((r) => [r.id, sharedSpans(r, levelRooms)])), [levelRooms]);
  const twinFramed = useMemo(
    () => (world ? twinFramedOpenings([...openings, ...world.openings.filter((o) => o.room_id !== room.id)]) : undefined),
    [world, openings, room.id]
  );
  const overhead = useMemo(
    () => aerialView(levelRooms, room, AERIAL_PITCH, AERIAL_FOV) ?? { x: room.width / 2, z: room.depth / 2, h: 10 },
    [levelRooms, room]
  );

  /** Set just before asking the parent to swap rooms: carry the pose across a doorway. */
  const carryRef = useRef<{ roomId: string; from: Room } | null>(null);
  const prevRoomRef = useRef(room);
  useLayoutEffect(() => {
    const prev = prevRoomRef.current;
    prevRoomRef.current = room;
    if (prev.id === room.id) return;
    glideRef.current = null;
    const carry = carryRef.current?.roomId === room.id ? carryRef.current : null;
    carryRef.current = null;
    if (carry) {
      // Same spot in the world, re-expressed in the new room's frame.
      poseRef.current = carryPose(poseRef.current, carry.from, room);
      return;
    }
    // A jump (overview, minimap, next room): come in through the door from
    // where you were if there is one, else the middle, descending from the air.
    const back = returnDoor(openings, room.id, prev.id);
    poseRef.current = { ...(back ? spawnAtDoor(back, room) : spawnPose(room)), pitch: NAV_PITCH };
    aerialRef.current = reducedMotion ? { p: 0, target: 0 } : { p: Math.max(aerialRef.current.p, 1), target: 0 };
  }, [room, openings, reducedMotion]);

  const enterRoom = useCallback(
    (targetId: string, mode: "carry" | "fly") => {
      carryRef.current = mode === "carry" ? { roomId: targetId, from: room } : null;
      onEnterRoom?.(targetId);
    },
    [room, onEnterRoom]
  );
  /** Tour to start as soon as this room (id) is entered and its stops are known. */
  const pendingTourRef = useRef<string | null>(autoTour ? room.id : null);

  const setAerial = useCallback((on: boolean) => {
    setOverview(on);
    aerialRef.current.target = on ? 1 : 0;
    if (on) glideRef.current = null;
  }, []);

  /**
   * Go to another room of the palace: through the connecting door if there is
   * one (glide to it, through it, carry on), else down from the air.
   */
  const travelTo = useCallback(
    (targetId: string, opts?: { tour?: boolean }) => {
      if (!world || !onEnterRoom || !world.rooms.some((r) => r.id === targetId)) {
        onGoRoom?.(targetId);
        return;
      }
      if (opts?.tour) pendingTourRef.current = targetId;
      if (targetId === room.id) {
        setAerial(false);
        return;
      }
      setTour(null);
      setSummary(null);
      const door = doorBetween(openings, room.id, targetId);
      const airborne = aerialRef.current.p > 0 || aerialRef.current.target === 1;
      if (door && !airborne && levelRooms.some((r) => r.id === targetId)) {
        const { approach, through } = doorPassage(door, room);
        glideRef.current = { from: { ...poseRef.current }, to: approach, next: through, t: 0, onDone: () => enterRoom(targetId, "carry") };
        return;
      }
      setOverview(false);
      enterRoom(targetId, "fly");
    },
    [world, onEnterRoom, onGoRoom, room, openings, levelRooms, enterRoom, setAerial]
  );

  /** Walked out through a linked door: carry on into that room, or let the parent navigate. */
  const handleExit = useCallback(
    (o: Opening) => {
      const t = o.target_room_id;
      if (t && onEnterRoom && levelRooms.some((r) => r.id === t)) enterRoom(t, "carry");
      else onExitDoor?.(o);
    },
    [onEnterRoom, levelRooms, enterRoom, onExitDoor]
  );
  /** "Go to <room>" at a door, or stepping again at a door stop. */
  const walkThrough = useCallback(
    (o: Opening) => {
      if (o.target_room_id && onEnterRoom && levelRooms.some((r) => r.id === o.target_room_id)) travelTo(o.target_room_id);
      else onExitDoor?.(o);
    },
    [onEnterRoom, levelRooms, travelTo, onExitDoor]
  );

  const items = useMemo(() => toWorldLoci(loci, room), [loci, room]);
  // Tour queue: canonical traversal order, or due-first when the caller
  // passes a card order and the player picks it. Same semantics as the 2D
  // study session (lib/srs.ts sortPlayQueue), so both agree.
  const [tourMode, setTourMode] = useState<"due" | "walk">("due");
  const stopsFor = useCallback(
    (mode: "due" | "walk"): Stop[] => {
      const base = buildTourStops(loci, cards);
      return mode === "due" && cardOrder && cardOrder.length > 0 ? orderTourStopsByCards(base, cardOrder) : base;
    },
    [loci, cards, cardOrder]
  );
  const liveStops = useMemo<Stop[]>(() => stopsFor(tourMode), [stopsFor, tourMode]);

  // ---------------------------------------------------------------- street-view navigation
  // Stops = loci in study order, then linked doors. Floor chevrons point at the
  // next/previous stop and at every linked door; click one (or ↑/→, ↓/←) to glide there.
  const nav = useMemo(() => navStops(loci, openings), [loci, openings]);
  const goStop = useCallback(
    (i: number) => {
      const st = nav[i];
      if (!st) return;
      if (st.kind === "door" && i === navIndex) {
        walkThrough(st.opening); // already at this door: walk through
        return;
      }
      setNavIndex(i);
      glideRef.current = { from: { ...poseRef.current }, to: stopPose(st, room, sight), t: 0, locusId: st.kind === "locus" ? st.locus.id : undefined };
    },
    [nav, navIndex, room, walkThrough, sight]
  );
  const stepNav = useCallback(
    (dir: 1 | -1) => {
      const cur = nav[navIndex];
      if (dir === 1 && cur?.kind === "door") return goStop(navIndex);
      const i = navStep(nav.length, navIndex, dir);
      if (i !== navIndex) goStop(i);
    },
    [nav, navIndex, goStop]
  );
  useEffect(() => {
    const t = window.setInterval(() => {
      if (glideRef.current) return setArrows((a) => (a.length ? [] : a));
      const next = navArrows(poseRef.current, nav, navIndex, room);
      setArrows((prev) => {
        const same =
          prev.length === next.length &&
          prev.every((p, i) => p.stopIndex === next[i].stopIndex && p.role === next[i].role && Math.abs(p.x - next[i].x) < 0.05 && Math.abs(p.z - next[i].z) < 0.05);
        return same ? prev : next;
      });
    }, 120);
    return () => window.clearInterval(t);
  }, [nav, navIndex, room]);

  // Minimap pose bridge: poseRef is mutated every frame (never React state), so
  // mirror it at ~8 Hz — plenty for a dot and wedge, no per-frame renders.
  const [minimapPose, setMinimapPose] = useState<MiniMapPose | null>(null);
  useEffect(() => {
    if (!levelPlan) return;
    const t = window.setInterval(() => {
      const p = poseRef.current;
      setMinimapPose((prev) =>
        prev && Math.abs(prev.x - p.x) < 0.03 && Math.abs(prev.z - p.z) < 0.03 && Math.abs(prev.yaw - p.yaw) < 0.02
          ? prev
          : { x: p.x, z: p.z, yaw: p.yaw }
      );
    }, 120);
    return () => window.clearInterval(t);
  }, [levelPlan]);

  // ---------------------------------------------------------------- tour
  const stops = tour && tourStops ? tourStops : liveStops;
  const stop = tour ? stops[tour.index] ?? null : null;

  const glideTo = useCallback(
    (s: Stop | null | undefined) => {
      if (!s) return;
      // Stand back a little and look slightly below the marker so it sits in
      // the upper half of the view, clear of the card panel.
      const to = viewPoseForLocus(s.locus, room, 2.6, 0.6, sight);
      glideRef.current = { from: { ...poseRef.current }, to: { ...to, pitch: to.pitch - 0.22 }, t: 0, locusId: s.locus.id };
    },
    [room, sight]
  );

  // Picking an order starts the tour in that order straight away.
  const startTour = useCallback(
    (mode?: "due" | "walk") => {
      const m = mode ?? tourMode;
      const s = stopsFor(m);
      if (s.length === 0) return;
      setTourMode(m);
      setAerial(false);
      setSummary(null);
      setRevealedCards({});
      setTourStops(s);
      setTour({ index: 0, revealed: false, results: {} });
      glideTo(s[0]);
    },
    [tourMode, stopsFor, glideTo, setAerial]
  );

  // Tour end: show the local summary now, persist the session + answers in
  // the background so the full /results summary can be linked when it lands.
  const finishTour = useCallback(
    (results: Record<string, boolean>) => {
      const graded = Object.values(results);
      const got = graded.filter(Boolean).length;
      setSummary({ got, total: graded.length });
      setTour(null);
      if (!onTourComplete || graded.length === 0) return;
      const answers: SessionAnswer[] = stops
        .filter((s) => s.card && s.key in results)
        .map((s) => ({
          id: s.card!.id,
          kind: "card" as const,
          cardId: s.card!.id,
          correct: results[s.key],
          roomId: room.id,
          roomTitle: room.title,
          locusId: s.locus.id,
          locusLabel: s.locus.label,
          label: stripMarkdown(cardFront(s.card!)).slice(0, 200),
        }));
      void Promise.resolve(onTourComplete(answers, got, graded.length))
        .then((href) => href && setSummary((prev) => (prev ? { ...prev, href } : prev)))
        .catch(() => {});
    },
    [stops, room, onTourComplete]
  );

  const goto = useCallback(
    (index: number) => {
      if (!tour) return;
      if (index >= stops.length) {
        finishTour(tour.results);
        return;
      }
      const i = Math.max(0, index);
      const prev = stops[tour.index];
      setTour({ ...tour, index: i, revealed: false });
      // Only move the camera when the locus changes (several cards can share one).
      if (!prev || prev.locus.id !== stops[i].locus.id || i === tour.index) glideTo(stops[i]);
    },
    [tour, stops, glideTo, finishTour]
  );

  const grade = useCallback(
    (correct: boolean) => {
      if (!tour || !stop) return;
      if (stop.card) void onGrade?.(stop.card, correct);
      const results = { ...tour.results, [stop.key]: correct };
      const next = tour.index + 1;
      if (next >= stops.length) {
        finishTour(results);
        return;
      }
      const prev = stop;
      setTour({ index: next, revealed: false, results });
      if (prev.locus.id !== stops[next].locus.id) glideTo(stops[next]);
    },
    [tour, stop, stops, onGrade, glideTo, finishTour]
  );

  // Phase D: MCQ choices for the current stop (stable per stop — memoized so
  // the shuffle doesn't re-roll every render). Null when no card; fallback
  // when fewer than 2 choices exist (self-grade path instead).
  const mcq = useMemo(
    () => (stop?.card ? buildChoices(stop.card, cards) : null),
    [stop, cards]
  );
  const choose = useCallback(
    (i: number) => {
      if (!tour || !stop?.card || !mcq || mcq.fallback || tour.revealed) return;
      grade(i === mcq.answerIndex);
    },
    [tour, stop, mcq, grade]
  );

  useEffect(() => {
    // Wait for the due order to settle so the tour doesn't start in walk order.
    if (pendingTourRef.current !== room.id || cardOrder === undefined || stopsFor(tourMode).length === 0) return;
    pendingTourRef.current = null;
    startTour();
  }, [room.id, cardOrder, stopsFor, tourMode, startTour]);

  // ---------------------------------------------------------------- input
  const tourRef = useRef({ tour, stop, goto, grade, startTour, stepNav, choose, mcq, overview, setAerial });
  useEffect(() => {
    tourRef.current = { tour, stop, goto, grade, startTour, stepNav, choose, mcq, overview, setAerial };
  }, [tour, stop, goto, grade, startTour, stepNav, choose, mcq, overview, setAerial]);
  useEffect(() => {
    const syncKeys = () => {
      const k = keysRef.current;
      // WASD walks freely; the arrow keys step between stops (see below).
      const fwd = (k.has("KeyW") ? 1 : 0) + (k.has("KeyS") ? -1 : 0);
      const str = (k.has("KeyD") ? 1 : 0) + (k.has("KeyA") ? -1 : 0);
      inputRef.current = { throttle: fwd, strafe: str };
    };
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const { tour: tr, stop: st, goto: go, grade: gr, startTour: start, stepNav: step, choose: ch, mcq: mq, overview: ov, setAerial: air } = tourRef.current;
      if (tr) {
        // Tour keys: Space/Enter reveal, ←/→ step, 1-4 answer MCQ, 1 = Missed / 2 = Got it (left/right button), Esc leave.
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          if (!tr.revealed) setTour({ ...tr, revealed: true });
          else go(tr.index + 1);
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          go(tr.index + 1);
        } else if (e.code === "ArrowLeft") {
          e.preventDefault();
          go(tr.index - 1);
        } else if (e.code === "Escape") {
          setTour(null);
        } else if (!tr.revealed && mq && !mq.fallback && st?.card && ["1", "2", "3", "4"].includes(e.key)) {
          ch(Number(e.key) - 1);
        } else if (tr.revealed && st?.card && (e.key === "1" || e.key === "2")) {
          gr(e.key === "2");
        }
        return;
      }
      if (e.code === "KeyO") {
        air(!ov);
        return;
      }
      if (ov) {
        if (e.code === "Escape") air(false);
        return;
      }
      if (e.code === "KeyT") {
        start();
        return;
      }
      if (e.code === "ArrowUp" || e.code === "ArrowRight") {
        e.preventDefault();
        if (!e.repeat) step(1);
        return;
      }
      if (e.code === "ArrowDown" || e.code === "ArrowLeft") {
        e.preventDefault();
        if (!e.repeat) step(-1);
        return;
      }
      if (e.code === "Space") e.preventDefault();
      keysRef.current.add(e.code);
      syncKeys();
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      syncKeys();
    };
    const blur = () => {
      keysRef.current.clear();
      syncKeys();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Moving keys pressed before the tour started shouldn't keep walking.
  useEffect(() => {
    if (tour) {
      keysRef.current.clear();
      inputRef.current = { throttle: 0, strafe: 0 };
    }
  }, [tour]);

  // Headless test hook: ?debug=1 exposes pose/focus/teleport on window.
  // Read once: walking on rewrites the address (dropping ?debug).
  const [debug] = useState(() => typeof window !== "undefined" && window.location.search.includes("debug"));
  useEffect(() => {
    if (!debug) return;
    (window as unknown as { __walk: unknown }).__walk = {
      pose: () => poseRef.current,
      introDone: () => aerialRef.current.p === 0 && aerialRef.current.target === 0,
      aerial: () => aerialRef.current.p,
      room: () => room.id,
      /** Rooms drawn in the scene (this one first, then the rest of its level). */
      drawn: () => levelRooms.map((r) => r.id),
      overview: (on: boolean) => setAerial(on),
      focused: () => focusedId,
      teleport: (x: number, z: number, yaw = 0, pitch = 0) => {
        poseRef.current = { x, z, yaw, pitch };
      },
    };
  }, [debug, focusedId, room.id, levelRooms, setAerial]);

  useEffect(() => {
    const t = window.setInterval(() => setOutside(isOutside(poseRef.current, room)), 300);
    return () => window.clearInterval(t);
  }, [room]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || glideRef.current) return;
    // Drag right turns right (yaw grows clockwise from north), drag up looks up.
    lookRef.current.yawDelta += (e.clientX - d.x) * 0.005;
    lookRef.current.pitchDelta -= (e.clientY - d.y) * 0.005;
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function handleFocus(id: string | null) {
    setFocusedId(id);
    setDismissedId((d) => (d === id ? d : null));
    // Revealed answers are keyed by card id and kept while you glance around;
    // they reset when a tour starts (see startTour), not on every focus change.
  }

  // Graded loci during a tour keep their colour: the room becomes a map of
  // what you recalled (green) and where you slipped (red).
  const lociResults = useMemo(() => {
    if (!tour) return null;
    const m: Record<string, boolean> = {};
    for (const st of stops) {
      const r = tour.results[st.key];
      if (r !== undefined) m[st.locus.id] = (m[st.locus.id] ?? true) && r;
    }
    return m;
  }, [tour, stops]);
  const focused = !tour && focusedId ? items.find((i) => i.locus.id === focusedId) ?? null : null;
  /** A bottom card owns the bottom of the screen (phones hide the minimap + joystick under it). */
  const cardOpen = !!tour || !!summary || (!!focused && dismissedId !== focused.locus.id);
  const focusedCards = focused ? cards.filter((c) => c.locus_id === focused.locus.id) : [];
  const focusedNumber = focused ? stops.find((s) => s.locus.id === focused.locus.id)?.locusIndex ?? 0 : 0;
  const lociCount = new Set(stops.map((s) => s.locus.id)).size;
  const targetTitle = nearDoor?.target_room_id ? roomTitles[nearDoor.target_room_id] ?? "next room" : null;
  // Where a palace tour continues once this room is done.
  const nextRoomRaw = nextRooms ? (tourMode === "walk" ? (nextRooms.any ?? nextRooms.due) : nextRooms.due) : null;
  const nextRoom = nextRoomRaw && nextRoomRaw.id !== room.id ? nextRoomRaw : null;

  // Minimap: the n-th locus (study order) is the same locus as nav stop / tour stop n.
  const mapLocusId = (n: number) => tourOrder(loci)[n - 1]?.id;
  function goMapLocus(n: number) {
    const id = mapLocusId(n);
    if (id) goToLocus(id);
  }
  /** Glide to a locus (minimap tap or a click on its plaque); in a tour, jump to its stop. */
  function goToLocus(id: string) {
    if (tour) {
      const i = stops.findIndex((s) => s.locus.id === id);
      if (i >= 0) goto(i);
      return;
    }
    const i = nav.findIndex((s) => s.kind === "locus" && s.locus.id === id);
    if (i >= 0) goStop(i);
  }
  const navCurrent = nav[navIndex];
  const activeLocusN = tour && stop
    ? stop.locusIndex + 1
    : focused
      ? (stops.find((s) => s.locus.id === focused.locus.id)?.locusIndex ?? -1) + 1 || null
      : navCurrent?.kind === "locus"
        ? navCurrent.number
        : null;

  return (
    <div className={`relative w-full overflow-hidden bg-background ${className}`}>
      <div
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <SceneGate title="Walk mode couldn't start" backHref={`/palaces/${room.palace_id}`} backLabel="Back to palace blueprint">
          <Canvas
            dpr={dpr}
            gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
            camera={{ fov: WALK_FOV, near: 0.05, far: 120 }}
          >
          {/* Adaptive quality: drop resolution, then the post effects, if frames sag. */}
          <PerformanceMonitor
            onDecline={() => setDpr(1)}
            onFallback={() => {
              setDpr(1);
              setFx(false);
            }}
          />
          <color attach="background" args={[colors.horizon]} />
          <fog attach="fog" args={[colors.fog, 12, 40]} />
          <SceneSky colors={colors} radius={100} />
          <SceneLights colors={colors} />
          <RoomShell room={room} openings={openings} colors={colors} animateDoors shared={shared.get(room.id)} twinFramed={twinFramed} />
          {/* The rest of the level, in this room's frame: doors open onto real rooms. */}
          {neighbours.map((n) => (
            <group key={n.room.id} position={toScene({ x: n.offset.x, y: 0, z: n.offset.z })}>
              <RoomShell room={n.room} openings={n.openings} colors={colors} animateDoors shared={shared.get(n.room.id)} twinFramed={twinFramed} />
              <LocusMarkers room={n.room} loci={n.loci} colors={colors} showPath={false} showLabels={false} />
            </group>
          ))}
          {overview && (
            <OverviewLabels
              rooms={levelRooms}
              origin={room}
              currentId={room.id}
              tally={world?.tally}
              lociCount={(id: string) => (id === room.id ? loci.length : (world?.loci.filter((l) => l.room_id === id).length ?? 0))}
              onPick={(id: string) => (id === room.id ? setAerial(false) : travelTo(id))}
            />
          )}
          <FloorShadows width={room.width} depth={room.depth} />
          <LocusMarkers
            room={room}
            loci={loci}
            colors={colors}
            selectedId={stop?.locus.id ?? focused?.locus.id ?? null}
            showPath={!!tour}
            labelFade={6}
            results={lociResults}
            pulse={pulse}
            onMarkerClick={(locus, e) => {
              if (e.delta > 4) return; // end of a look-around drag
              e.stopPropagation();
              goToLocus(locus.id);
            }}
          />
          {!overview && <DoorSigns room={room} openings={openings} roomTitles={roomTitles} />}
          {!tour && !overview && <NavChevrons arrows={arrows} stops={nav} roomTitles={roomTitles} colors={colors} onGo={goStop} />}
          <PlayerRig
            room={room}
            openings={openings}
            items={items}
            poseRef={poseRef}
            inputRef={inputRef}
            joyRef={joyRef}
            lookRef={lookRef}
            glideRef={glideRef}
            frozen={!!tour || overview}
            aerialRef={aerialRef}
            overhead={overhead}
            onArrive={arrive}
            onFocus={handleFocus}
            onExit={handleExit}
            onNearDoor={setNearDoor}
          />
          {fx && <SceneFX lite={coarse} />}
          </Canvas>
        </SceneGate>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4">
        <div className="card-base pointer-events-auto max-w-[min(26rem,100%)] px-3 py-2 max-sm:py-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{room.title}</p>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? "Mute arrival chimes" : "Play arrival chimes"}
              title={sound ? "Mute arrival chimes" : "Play arrival chimes"}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {sound ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tour ? (
              `Tour · stop ${tour.index + 1} of ${stops.length}`
            ) : outside ? (
              "Outside: walk back through a door"
            ) : (
              <>
                {lociCount} loci
                <span className="pointer-coarse:hidden"> · floor arrows or ↑/↓ to step · WASD walk · drag to look · T tour</span>
                <span className="hidden pointer-coarse:inline"> · drag to look · stick to walk · tap the floor arrows</span>
              </>
            )}
          </p>
          {/* Phones: the page actions ride along as small links here, freeing a row of buttons. */}
          {actions && (
            <div className="mt-1 hidden gap-3 text-xs max-sm:flex [&_a]:!border-0 [&_a]:!bg-transparent [&_a]:!p-0 [&_a]:!text-xs [&_a]:!font-medium [&_a]:!text-link [&_a]:!shadow-none">
              {actions}
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {/* Each order starts its tour straight away (a mode toggle that did nothing until
              a second click read as broken). */}
          {!tour && !overview && stops.length > 0 && (
            <div className="flex gap-2" role="group" aria-label="Start a tour">
              {cardOrder && cardOrder.length > 0 && (
                <button
                  type="button"
                  onClick={() => startTour("due")}
                  className="btn-primary max-sm:!px-3 max-sm:!py-1.5"
                  title="Tour this room's cards, the ones due for review first (T)"
                >
                  {"\u25B6"} Due first
                </button>
              )}
              <button
                type="button"
                onClick={() => startTour("walk")}
                className={`${cardOrder && cardOrder.length > 0 ? "btn-outline bg-card" : "btn-primary"} max-sm:!px-3 max-sm:!py-1.5`}
                title="Tour every locus in order, start to finish"
              >
                <Footprints className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Walkthrough</span>
              </button>
            </div>
          )}
          {!tour && (
            <button
              type="button"
              onClick={() => setAerial(!overview)}
              aria-pressed={overview}
              className={`${overview ? "btn-primary" : "btn-outline bg-card"} max-sm:!px-3 max-sm:!py-1.5`}
              title={overview ? "Back down to eye level (Esc)" : "See the whole floor from above (O)"}
            >
              {overview ? (
                <>
                  <Footprints className="h-4 w-4" aria-hidden /> Back to walking
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Overview</span>
                </>
              )}
            </button>
          )}
          {tour && (
            <button type="button" onClick={() => setTour(null)} className="btn-outline bg-card">
              End tour
            </button>
          )}
          {actions && <div className="flex gap-2 max-sm:hidden">{actions}</div>}
        </div>
      </div>

      {levelPlan && (
        <div className={`absolute bottom-4 right-4 z-10 ${cardOpen ? "max-sm:hidden" : ""}`}>
          <MiniMap
            plan={levelPlan}
            currentRoomId={room.id}
            pose={minimapPose}
            activeLocusN={activeLocusN}
            roomTitles={roomTitles}
            onGoLocus={goMapLocus}
            onGoRoom={world && onEnterRoom ? (id) => travelTo(id) : onGoRoom}
          />
        </div>
      )}

      {nearDoor && targetTitle && !tour && !overview && (onExitDoor || onEnterRoom) && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
          <button type="button" onClick={() => walkThrough(nearDoor)} className="btn-primary pointer-events-auto shadow-lg">
            Go to {targetTitle} {"\u2192"}
          </button>
        </div>
      )}

      {tour && stop && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="card-base pointer-events-auto w-full max-w-lg p-5" role="dialog" aria-label="Tour card">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-base font-bold text-accent-foreground">{stop.locusIndex + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Locus {stop.locusIndex + 1} of {lociCount}</p>
                <p className="truncate text-lg font-semibold">{stop.locus.label || "Untitled locus"}</p>
              </div>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((tour.index + 1) / stops.length) * 100}%` }} />
              </div>
            </div>
            {stop.card ? (
              <>
                <div className="text-xl font-semibold leading-snug">
                  <Markdown text={cardFront(stop.card)} />
                </div>
                {tour.revealed ? (
                  <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-base">
                    {cardBack(stop.card) ? (
                      <Markdown text={cardBack(stop.card)} />
                    ) : (
                      <em className="text-muted-foreground">No answer written</em>
                    )}
                  </div>
                ) : mcq && !mcq.fallback ? (
                  <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Answer choices">
                    {mcq.choices.map((choice, i) => (
                      <button key={i} type="button" onClick={() => choose(i)} className="btn-outline justify-start !py-2.5 text-left">
                        <kbd className="mr-2 rounded bg-muted px-1.5 text-[10px]">{i + 1}</kbd>
                        <Markdown inline text={choice} />
                      </button>
                    ))}
                    <p className="text-sm text-muted-foreground">Picture it at this spot, then choose.</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Picture it at this spot, then reveal.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No card on this locus yet. Fix the place in your mind and move on.</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost px-2" disabled={tour.index === 0} onClick={() => goto(tour.index - 1)}>
                {"\u2190"} Prev
              </button>
              <div className="flex-1" />
              {stop.card && !tour.revealed && (!mcq || mcq.fallback) && (
                <button type="button" className="btn-primary" onClick={() => setTour({ ...tour, revealed: true })}>
                  Reveal <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">Space</kbd>
                </button>
              )}
              {stop.card && !tour.revealed && mcq && !mcq.fallback && (
                <button type="button" className="btn-ghost" onClick={() => setTour({ ...tour, revealed: true })}>
                  Reveal instead
                </button>
              )}
              {stop.card && tour.revealed && (
                <>
                  <button type="button" className="btn-outline" onClick={() => grade(false)}>
                    Missed <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">1</kbd>
                  </button>
                  <button type="button" className="btn-primary" onClick={() => grade(true)}>
                    Got it <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">2</kbd>
                  </button>
                </>
              )}
              {!stop.card && (
                <button type="button" className="btn-primary" onClick={() => goto(tour.index + 1)}>
                  Next {"\u2192"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {summary && !tour && !overview && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="card-base pointer-events-auto w-full max-w-md p-5 text-center" role="dialog" aria-label="Tour complete">
            <p className="text-lg font-semibold">{room.title}: tour complete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.total > 0 ? `You recalled ${summary.got} of ${summary.total} cards.` : "You walked every locus."}
            </p>
            {nextRoom ? (
              <p className="mt-2 text-sm">
                Next: <span className="font-semibold">{nextRoom.title}</span>
                <span className="text-muted-foreground">
                  {" \u00b7 "}
                  {nextRoom.due > 0 ? `${nextRoom.due} due` : `${nextRoom.cards} card${nextRoom.cards === 1 ? "" : "s"}`}
                </span>
              </p>
            ) : (
              nextRooms && <p className="mt-2 text-sm text-muted-foreground">That was the last room with cards due: the palace is clear.</p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {nextRoom && (
                <button type="button" className="btn-primary" onClick={() => travelTo(nextRoom.id, { tour: true })}>
                  Continue to {nextRoom.title} {"\u2192"}
                </button>
              )}
              {summary.href && (
                <Link href={summary.href} className={nextRoom ? "btn-outline" : "btn-primary"}>
                  Full summary
                </Link>
              )}
              <button type="button" className={summary.href || nextRoom ? "btn-outline" : "btn-primary"} onClick={() => startTour()}>
                Tour again
              </button>
              <button type="button" className="btn-ghost" onClick={() => setSummary(null)}>
                Walk freely
              </button>
            </div>
          </div>
        </div>
      )}

      {focused && dismissedId !== focused.locus.id && !summary && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="card-base pointer-events-auto max-h-[45dvh] w-full max-w-md overflow-y-auto p-4">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Locus {focusedNumber + 1}</p>
                <p className="text-lg font-semibold">{focused.locus.label}</p>
              </div>
              <button type="button" onClick={() => setDismissedId(focused.locus.id)} className="btn-ghost shrink-0" aria-label="Dismiss locus">
                Keep walking {"\u2192"}
              </button>
            </div>
            {focusedCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cards on this locus yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {focusedCards.map((card) => (
                  <div key={card.id} className="rounded-xl border border-border p-3">
                    <div className="font-medium">
                      <Markdown text={cardFront(card)} />
                    </div>
                    {revealedCards[card.id] ? (
                      <div className="mt-1 text-sm text-link">
                        <Markdown text={cardBack(card)} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => setRevealedCards((r) => ({ ...r, [card.id]: true }))} className="btn-outline mt-2 !px-3 !py-1.5 !text-xs">
                        Reveal answer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Joystick joyRef={joyRef} hidden={cardOpen || overview} />
    </div>
  );
}
