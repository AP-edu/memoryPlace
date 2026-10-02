"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  stopPose,
  type NavArrow,
  type NavStop,
  easeInOut,
  exitThroughDoor,
  inwardNormal,
  lerpPose,
  toScene,
  viewPoseForLocus,
  type TourStop,
} from "@/lib/scene3d";
import { LocusMarkers, RoomShell, SceneLights } from "./RoomShell";
import { useSceneColors } from "./useSceneColors";

// First-person walk mode + guided tour. Movement/collision/focus/tour maths
// live in lib/walk.ts and lib/scene3d.ts (pure, unit-tested); this file is
// rendering and input only.

const GLIDE_S = 0.9;
type Stop = TourStop<Locus, Card>;

interface Glide {
  from: Pose;
  to: Pose;
  t: number;
}

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
  onFocus: (id: string | null) => void;
  onExit: (o: Opening) => void;
  onNearDoor: (o: Opening | null) => void;
}) {
  const size = { width: room.width, depth: room.depth };
  const lastFocus = useRef<string | null>(null);
  const lastNear = useRef<string | null>(null);
  const exited = useRef(false);
  useFrame(({ camera }, delta) => {
    let pose = poseRef.current;
    const glide = glideRef.current;
    if (glide) {
      glide.t = Math.min(1, glide.t + delta / GLIDE_S);
      pose = lerpPose(glide.from, glide.to, easeInOut(glide.t));
      if (glide.t >= 1) glideRef.current = null;
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
        pose = stepPlayer(pose, input, delta, size, openings, { speed: WALK_SPEED, radius: PLAYER_RADIUS });
      }
    }
    lookRef.current.yawDelta = 0;
    lookRef.current.pitchDelta = 0;
    poseRef.current = pose;

    const f = forwardVec(pose.yaw, pose.pitch);
    camera.position.set(...toScene({ x: pose.x, y: EYE_HEIGHT, z: pose.z }));
    camera.lookAt(...toScene({ x: pose.x + f.x, y: EYE_HEIGHT + f.y, z: pose.z + f.z }));

    if (!frozen) {
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
      if (Math.hypot(p.x - pose.x, p.z - pose.z) < 1.6) near = o;
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

function Joystick({ joyRef }: { joyRef: React.MutableRefObject<MoveInput> }) {
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
  /** Extra controls rendered top-right. */
  actions?: React.ReactNode;
  /** Start the guided tour immediately. */
  autoTour?: boolean;
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
  actions,
  autoTour = false,
  className = "h-dvh",
}: WalkViewProps) {
  const colors = useSceneColors();
  // Look slightly down (Street-View style) so the floor chevrons are in view.
  const poseRef = useRef<Pose>({ ...(spawn ?? spawnPose(room)), pitch: NAV_PITCH });
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

  // Parents remount this component per room (key={room.id}) so the spawn pose applies.

  const items = useMemo(() => toWorldLoci(loci, room), [loci, room]);
  const stops = useMemo<Stop[]>(() => buildTourStops(loci, cards), [loci, cards]);

  // ---------------------------------------------------------------- street-view navigation
  // Stops = loci in study order, then linked doors. Floor chevrons point at the
  // next/previous stop and at every linked door; click one (or ↑/→, ↓/←) to glide there.
  const nav = useMemo(() => navStops(loci, openings), [loci, openings]);
  const [navIndex, setNavIndex] = useState(-1);
  const [arrows, setArrows] = useState<NavArrow[]>([]);
  const goStop = useCallback(
    (i: number) => {
      const st = nav[i];
      if (!st) return;
      if (st.kind === "door" && i === navIndex) {
        onExitDoor?.(st.opening); // already at this door: walk through
        return;
      }
      setNavIndex(i);
      glideRef.current = { from: { ...poseRef.current }, to: stopPose(st, room), t: 0 };
    },
    [nav, navIndex, room, onExitDoor]
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

  // ---------------------------------------------------------------- tour
  const [tour, setTour] = useState<{ index: number; revealed: boolean; results: Record<string, boolean> } | null>(null);
  const [summary, setSummary] = useState<{ got: number; total: number } | null>(null);
  const stop = tour ? stops[tour.index] ?? null : null;

  const glideTo = useCallback(
    (s: Stop | null | undefined) => {
      if (!s) return;
      // Stand back a little and look slightly below the marker so it sits in
      // the upper half of the view, clear of the card panel.
      const to = viewPoseForLocus(s.locus, room, 2.6);
      glideRef.current = { from: { ...poseRef.current }, to: { ...to, pitch: to.pitch - 0.22 }, t: 0 };
    },
    [room]
  );

  const startTour = useCallback(() => {
    if (stops.length === 0) return;
    setSummary(null);
    setTour({ index: 0, revealed: false, results: {} });
    glideTo(stops[0]);
  }, [stops, glideTo]);

  const goto = useCallback(
    (index: number) => {
      if (!tour) return;
      if (index >= stops.length) {
        const graded = Object.values(tour.results);
        setSummary({ got: graded.filter(Boolean).length, total: graded.length });
        setTour(null);
        return;
      }
      const i = Math.max(0, index);
      const prev = stops[tour.index];
      setTour({ ...tour, index: i, revealed: false });
      // Only move the camera when the locus changes (several cards can share one).
      if (!prev || prev.locus.id !== stops[i].locus.id || i === tour.index) glideTo(stops[i]);
    },
    [tour, stops, glideTo]
  );

  const grade = useCallback(
    (correct: boolean) => {
      if (!tour || !stop) return;
      if (stop.card) void onGrade?.(stop.card, correct);
      const results = { ...tour.results, [stop.key]: correct };
      const next = tour.index + 1;
      if (next >= stops.length) {
        const graded = Object.values(results);
        setSummary({ got: graded.filter(Boolean).length, total: graded.length });
        setTour(null);
        return;
      }
      const prev = stop;
      setTour({ index: next, revealed: false, results });
      if (prev.locus.id !== stops[next].locus.id) glideTo(stops[next]);
    },
    [tour, stop, stops, onGrade, glideTo]
  );

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoTour && !autoStarted.current && stops.length > 0) {
      autoStarted.current = true;
      startTour();
    }
  }, [autoTour, stops.length, startTour]);

  // ---------------------------------------------------------------- input
  const tourRef = useRef({ tour, stop, goto, grade, startTour, stepNav });
  useEffect(() => {
    tourRef.current = { tour, stop, goto, grade, startTour, stepNav };
  }, [tour, stop, goto, grade, startTour, stepNav]);
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
      const { tour: tr, stop: st, goto: go, grade: gr, startTour: start, stepNav: step } = tourRef.current;
      if (tr) {
        // Tour keys: Space/Enter reveal, ←/→ step, 1/2 grade, Esc leave.
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
        } else if (tr.revealed && st?.card && (e.key === "1" || e.key === "2")) {
          gr(e.key === "1");
        }
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
  useEffect(() => {
    if (!window.location.search.includes("debug")) return;
    (window as unknown as { __walk: unknown }).__walk = {
      pose: () => poseRef.current,
      focused: () => focusedId,
      teleport: (x: number, z: number, yaw = 0, pitch = 0) => {
        poseRef.current = { x, z, yaw, pitch };
      },
    };
  }, [focusedId]);

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
    setRevealedCards({});
  }

  const focused = !tour && focusedId ? items.find((i) => i.locus.id === focusedId) ?? null : null;
  const focusedCards = focused ? cards.filter((c) => c.locus_id === focused.locus.id) : [];
  const focusedNumber = focused ? stops.find((s) => s.locus.id === focused.locus.id)?.locusIndex ?? 0 : 0;
  const lociCount = new Set(stops.map((s) => s.locus.id)).size;
  const targetTitle = nearDoor?.target_room_id ? roomTitles[nearDoor.target_room_id] ?? "next room" : null;

  return (
    <div className={`relative w-full overflow-hidden bg-background ${className}`}>
      <div
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Canvas camera={{ fov: 70, near: 0.05, far: 120 }}>
          <color attach="background" args={[colors.sky]} />
          <fog attach="fog" args={[colors.fog, 12, 40]} />
          <SceneLights colors={colors} />
          <RoomShell room={room} openings={openings} colors={colors} />
          <LocusMarkers room={room} loci={loci} colors={colors} selectedId={stop?.locus.id ?? focused?.locus.id ?? null} showPath={!!tour} />
          <DoorSigns room={room} openings={openings} roomTitles={roomTitles} />
          {!tour && <NavChevrons arrows={arrows} stops={nav} roomTitles={roomTitles} colors={colors} onGo={goStop} />}
          <PlayerRig
            room={room}
            openings={openings}
            items={items}
            poseRef={poseRef}
            inputRef={inputRef}
            joyRef={joyRef}
            lookRef={lookRef}
            glideRef={glideRef}
            frozen={!!tour}
            onFocus={handleFocus}
            onExit={(o) => onExitDoor?.(o)}
            onNearDoor={setNearDoor}
          />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4">
        <div className="card-base pointer-events-auto px-3 py-2">
          <p className="text-sm font-semibold">{room.title}</p>
          <p className="text-xs text-muted-foreground">
            {tour
              ? `Tour · stop ${tour.index + 1} of ${stops.length}`
              : outside
                ? "Outside: walk back through a door"
                : `${lociCount} loci · click floor arrows or ↑/↓ to step · WASD walk · drag to look · T tour`}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {!tour && stops.length > 0 && (
            <button type="button" onClick={startTour} className="btn-primary">
              {"\u25B6"} Start tour
            </button>
          )}
          {tour && (
            <button type="button" onClick={() => setTour(null)} className="btn-outline bg-card">
              End tour
            </button>
          )}
          {actions}
        </div>
      </div>

      {nearDoor && targetTitle && !tour && onExitDoor && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
          <button type="button" onClick={() => onExitDoor(nearDoor)} className="btn-primary pointer-events-auto shadow-lg">
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
                <p className="text-xl font-semibold leading-snug">{cardFront(stop.card)}</p>
                {tour.revealed ? (
                  <p className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-base">{cardBack(stop.card) || <em className="text-muted-foreground">No answer written</em>}</p>
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
              {stop.card && !tour.revealed && (
                <button type="button" className="btn-primary" onClick={() => setTour({ ...tour, revealed: true })}>
                  Reveal <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">Space</kbd>
                </button>
              )}
              {stop.card && tour.revealed && (
                <>
                  <button type="button" className="btn-outline" onClick={() => grade(false)}>
                    Missed <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">2</kbd>
                  </button>
                  <button type="button" className="btn-primary" onClick={() => grade(true)}>
                    Got it <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">1</kbd>
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

      {summary && !tour && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="card-base pointer-events-auto w-full max-w-sm p-5 text-center">
            <p className="text-lg font-semibold">Tour complete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.total > 0 ? `You recalled ${summary.got} of ${summary.total} cards.` : "You walked every locus."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" className="btn-primary" onClick={startTour}>
                Tour again
              </button>
              <button type="button" className="btn-outline" onClick={() => setSummary(null)}>
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
                    <p className="font-medium">{cardFront(card)}</p>
                    {revealedCards[card.id] ? (
                      <p className="mt-1 text-sm text-link">{cardBack(card)}</p>
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

      <Joystick joyRef={joyRef} />
    </div>
  );
}
