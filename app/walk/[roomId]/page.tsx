"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { useFetch } from "@/hooks/useFetch";
import type { Card, Locus, Opening, Room, WallFace } from "@/types/database";
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
  wallSpans,
  type MoveInput,
  type Pose,
  type WorldLocus,
} from "@/lib/walk";

// Phase F: first-person walk mode. Movement/collision/focus math lives in
// lib/walk.ts (pure, headless-tested); this file is rendering + input only.

const WALLS: WallFace[] = ["north", "south", "east", "west"];
const WALL_THICK = 0.2;

function RoomMesh({ room, openings }: { room: Room; openings: Opening[] }) {
  const size = { width: room.width, depth: room.depth };
  return (
    <group>
      <mesh position={[room.width / 2, -0.05, room.depth / 2]}>
        <boxGeometry args={[room.width + 0.4, 0.1, room.depth + 0.4]} />
        <meshStandardMaterial color="#cfd4d0" />
      </mesh>
      {WALLS.flatMap((wall) =>
        wallSpans(size, wall, openings).map((span, i) => {
          const a = wallPoint(wall, span.from, size);
          const b = wallPoint(wall, span.to, size);
          const mx = (a.x + b.x) / 2;
          const mz = (a.z + b.z) / 2;
          const horizontal = wall === "north" || wall === "south";
          const len = horizontal ? b.x - a.x : b.z - a.z;
          if (len <= 0.01) return null;
          return (
            <mesh
              key={`${wall}-${i}`}
              position={[mx, room.height / 2, mz]}
            >
              <boxGeometry args={horizontal ? [len, room.height, WALL_THICK] : [WALL_THICK, room.height, len]} />
              <meshStandardMaterial color="#8a6d4f" />
            </mesh>
          );
        })
      )}
    </group>
  );
}

function LocusMarkers({ items, focusedId }: { items: WorldLocus[]; focusedId: string | null }) {
  return (
    <group>
      {items.map(({ locus, x, y, z }) => {
        const focused = locus.id === focusedId;
        return (
          <mesh key={locus.id} position={[x, y, z]}>
            <sphereGeometry args={[focused ? 0.3 : 0.2, 16, 16]} />
            <meshStandardMaterial
              color={focused ? "#1d4ed8" : "#3b82f6"}
              emissive={focused ? "#1d4ed8" : "#000000"}
              emissiveIntensity={focused ? 0.55 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function PlayerRig({
  room,
  openings,
  items,
  poseRef,
  inputRef,
  lookRef,
  onFocus,
}: {
  room: Room;
  openings: Opening[];
  items: WorldLocus[];
  poseRef: React.MutableRefObject<Pose>;
  inputRef: React.MutableRefObject<MoveInput>;
  lookRef: React.MutableRefObject<{ yawDelta: number; pitchDelta: number }>;
  onFocus: (id: string | null) => void;
}) {
  const size = { width: room.width, depth: room.depth };
  const lastFocus = useRef<string | null>(null);
  useFrame(({ camera }, delta) => {
    const pose = poseRef.current;
    pose.yaw += lookRef.current.yawDelta;
    pose.pitch = Math.min(1.2, Math.max(-1.2, pose.pitch + lookRef.current.pitchDelta));
    lookRef.current.yawDelta = 0;
    lookRef.current.pitchDelta = 0;
    const next = stepPlayer(pose, inputRef.current, delta, size, openings, {
      speed: WALK_SPEED,
      radius: PLAYER_RADIUS,
    });
    poseRef.current = next;
    const f = forwardVec(next.yaw, next.pitch);
    camera.position.set(next.x, EYE_HEIGHT, next.z);
    camera.lookAt(next.x + f.x, EYE_HEIGHT + f.y, next.z + f.z);

    const hit = focusLocus(
      { x: next.x, y: EYE_HEIGHT, z: next.z, yaw: next.yaw, pitch: next.pitch },
      items
    );
    const id = hit ? hit.locus.id : null;
    if (id !== lastFocus.current) {
      lastFocus.current = id;
      onFocus(id);
    }
  });
  return null;
}

export default function WalkPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { data: room, loading: loadingRoom, error: roomError } = useFetch<Room>(
    roomId ? `/api/rooms/${roomId}` : null
  );
  const { data: loci, loading: loadingLoci } = useFetch<Locus[]>(
    roomId ? `/api/loci?room=${roomId}` : null
  );
  const { data: openings } = useFetch<Opening[]>(
    roomId ? `/api/openings?room=${roomId}` : null
  );
  const { data: cards } = useFetch<Card[]>(
    roomId ? `/api/cards?room=${roomId}` : null
  );

  const poseRef = useRef<Pose | null>(null);
  const inputRef = useRef<MoveInput>({ throttle: 0, strafe: 0 });
  const lookRef = useRef({ yawDelta: 0, pitchDelta: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const [outside, setOutside] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const items = useMemo(() => (room && loci ? toWorldLoci(loci, room) : []), [room, loci]);

  const [spawned, setSpawned] = useState(false);
  useEffect(() => {
    if (room && !poseRef.current) {
      poseRef.current = spawnPose(room);
      setSpawned(true);
    }
  }, [room]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      keysRef.current.add(e.code);
      syncKeys();
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      syncKeys();
    };
    const syncKeys = () => {
      const k = keysRef.current;
      const fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) + (k.has("KeyS") || k.has("ArrowDown") ? -1 : 0);
      const str = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) + (k.has("KeyA") || k.has("ArrowLeft") ? -1 : 0);
      inputRef.current = { throttle: fwd, strafe: str };
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Headless test hook: ?debug=1 exposes pose/focus/teleport on window.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.search.includes("debug")) return;
    (window as unknown as { __walk: unknown }).__walk = {
      pose: () => poseRef.current,
      focused: () => focusedRef.current,
      outside: () => (poseRef.current && room ? isOutside(poseRef.current, room) : null),
      teleport: (x: number, z: number, yaw = 0, pitch = 0) => {
        poseRef.current = { x, z, yaw, pitch };
      },
    };
  }, [room]);

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  function handleFocus(id: string | null) {
    focusedRef.current = id;
    setFocusedId(id);
    if (id !== dismissedId) setDismissedId(null);
    setRevealed({});
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    lookRef.current.yawDelta -= (e.clientX - d.x) * 0.005;
    lookRef.current.pitchDelta -= (e.clientY - d.y) * 0.005;
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  useEffect(() => {
    if (!room || !poseRef.current) return;
    const t = window.setInterval(() => {
      setOutside(isOutside(poseRef.current as Pose, room));
    }, 300);
    return () => window.clearInterval(t);
  }, [room]);

  if (!roomId) return <p className="p-6">Missing room id.</p>;
  if (loadingRoom || loadingLoci) return <p className="p-6 text-muted-foreground">Entering the palace...</p>;
  if (roomError || !room || !spawned) {
    return <p className="p-6 text-destructive">Could not enter this room{roomError ? ` (${roomError})` : ""}.</p>;
  }

  const focused = items.find((i) => i.locus.id === focusedId) ?? null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#ded8cc]">
      <div
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Canvas camera={{ fov: 70, near: 0.1, far: 120 }}>
          <color attach="background" args={["#ded8cc"]} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[12, 18, 8]} intensity={1.1} />
          <RoomMesh room={room} openings={openings ?? []} />
          <LocusMarkers items={items} focusedId={focusedId} />
          <PlayerRig
            room={room}
            openings={openings ?? []}
            items={items}
            poseRef={poseRef as React.MutableRefObject<Pose>}
            inputRef={inputRef}
            lookRef={lookRef}
            onFocus={handleFocus}
          />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4">
        <div className="card-base pointer-events-auto px-3 py-2">
          <p className="text-sm font-semibold">{room.title}</p>
          <p className="text-xs text-muted-foreground">
            {outside ? "Outside — walk back through a door" : `${items.length} loci · WASD + drag to look`}
          </p>
        </div>
        <Link href={`/rooms/${room.id}`} className="card-base pointer-events-auto px-3 py-2 text-sm font-medium hover:text-primary">
          {"\u2190 2D builder"}
        </Link>
      </div>

      {focused && dismissedId !== focused.locus.id && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="card-base max-h-[45dvh] w-full max-w-md overflow-y-auto p-4">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Locus {focused.locus.position + 1}
                </p>
                <p className="text-lg font-semibold">{focused.locus.label}</p>
              </div>
              <button onClick={() => setDismissedId(focused.locus.id)} className="btn-ghost shrink-0" aria-label="Dismiss locus">
                Keep walking {"\u2192"}
              </button>
            </div>
            {(() => {
              const locusCards = (cards ?? []).filter((c) => c.locus_id === focused.locus.id);
              if (locusCards.length === 0) {
                return <p className="text-sm text-muted-foreground">No cards on this locus yet.</p>;
              }
              return (
                <div className="flex flex-col gap-2">
                  {locusCards.map((card) => (
                    <div key={card.id} className="rounded-lg border border-border p-3">
                      <p className="font-medium">{cardFront(card)}</p>
                      {revealed[card.id] ? (
                        <p className="mt-1 text-sm text-accent">{cardBack(card)}</p>
                      ) : (
                        <button
                          onClick={() => setRevealed((r) => ({ ...r, [card.id]: true }))}
                          className="btn-outline mt-2 !px-3 !py-1.5 !text-xs"
                        >
                          Reveal answer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            <Link href={`/study/${room.id}`} className="btn-ghost mt-3 !text-xs">
              Open in study {"\u2192"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
