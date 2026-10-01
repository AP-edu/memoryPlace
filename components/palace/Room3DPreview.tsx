"use client";
import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { useFetch } from "@/hooks/useFetch";
import type { Locus, Opening, Room } from "@/types/database";
import { openingWidthM } from "@/lib/geometry";

// R3F crash notes:
// - <Canvas> owns renderer/scene/camera. Everything inside is three.js, declaratively.
// - <mesh position={[x,y,z]}> + <boxGeometry args={[w,h,d]}> + <meshStandardMaterial/> = a box.
// - useFrame((state)=>...) runs every frame — use for movement/animation.
// - drei gives <OrbitControls/> (orbit/zoom) and <PointerLockControls/> (FPS look) for free.

function locusPos(l: Locus, r: Room): [number, number, number] {
  const w = l.wall ?? "north";
  const off = typeof l.wall_offset === "number" ? l.wall_offset : 0.5;
  const h = typeof l.height === "number" ? l.height : 1.5;
  switch (w) {
    case "north":
      return [r.width * off, h, r.depth];
    case "south":
      return [r.width * off, h, 0];
    case "east":
      return [r.width, h, r.depth * off];
    case "west":
      return [0, h, r.depth * off];
  }
}

function SingleWall({
  room,
  wall,
  color,
}: {
  room: Room;
  wall: "north" | "south" | "east" | "west";
  color: string;
}) {
  if (wall === "north" || wall === "south") {
    const z = wall === "north" ? room.depth : 0;
    return (
      <mesh position={[room.width / 2, room.height / 2, z]}>
        <boxGeometry args={[room.width, room.height, 0.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  const x = wall === "east" ? room.width : 0;
  return (
    <mesh position={[x, room.height / 2, room.depth / 2]}>
      <boxGeometry args={[0.2, room.height, room.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function WallWithGaps({
  room,
  wall,
  openings,
}: {
  room: Room;
  wall: "north" | "south" | "east" | "west";
  openings: Opening[];
}) {
  const o = openings.find((x) => x.wall === wall);
  const horizontal = wall === "north" || wall === "south";
  const wallLen = horizontal ? room.width : room.depth;
  const color = "#8a6d4f";

  if (!o) return <SingleWall room={room} wall={wall} color={color} />;

  const gapCenter = o.wall_offset * wallLen;
  // Same unit as walk mode / room editor: absolute metres via openingWidthM.
  const gapW = openingWidthM(o, room);
  const seg1Len = Math.max(0.1, gapCenter - gapW / 2);
  const seg2Len = Math.max(0.1, wallLen - (gapCenter + gapW / 2));
  const seg1Center = seg1Len / 2;
  const seg2Center = gapCenter + gapW / 2 + seg2Len / 2;
  const segColor = o.kind === "archway" ? "#7a9cc4" : color;

  if (horizontal) {
    const z = wall === "north" ? room.depth : 0;
    return (
      <group>
        <mesh position={[seg1Center, room.height / 2, z]}>
          <boxGeometry args={[seg1Len, room.height, 0.2]} />
          <meshStandardMaterial color={segColor} />
        </mesh>
        <mesh position={[seg2Center, room.height / 2, z]}>
          <boxGeometry args={[seg2Len, room.height, 0.2]} />
          <meshStandardMaterial color={segColor} />
        </mesh>
        {o.kind === "archway" && (
          <mesh position={[gapCenter, room.height - 0.15, z]}>
            <boxGeometry args={[gapW, 0.3, 0.2]} />
            <meshStandardMaterial color={segColor} />
          </mesh>
        )}
      </group>
    );
  }
  const x = wall === "east" ? room.width : 0;
  return (
    <group>
      <mesh position={[x, room.height / 2, seg1Center]}>
        <boxGeometry args={[0.2, room.height, seg1Len]} />
        <meshStandardMaterial color={segColor} />
      </mesh>
      <mesh position={[x, room.height / 2, seg2Center]}>
        <boxGeometry args={[0.2, room.height, seg2Len]} />
        <meshStandardMaterial color={segColor} />
      </mesh>
      {o.kind === "archway" && (
        <mesh position={[x, room.height - 0.15, gapCenter]}>
          <boxGeometry args={[0.2, 0.3, gapW]} />
          <meshStandardMaterial color={segColor} />
        </mesh>
      )}
    </group>
  );
}

function WalkKeys({
  room,
  keysRef,
}: {
  room: Room;
  keysRef: { current: Record<string, boolean> };
}) {
  useFrame(({ camera }, delta) => {
    const speed = 4 * delta;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).negate();
    const k = keysRef.current ?? {};
    if (k["w"]) camera.position.addScaledVector(dir, speed);
    if (k["s"]) camera.position.addScaledVector(dir, -speed);
    if (k["a"]) camera.position.addScaledVector(side, -speed);
    if (k["d"]) camera.position.addScaledVector(side, speed);
    camera.position.x = Math.max(0.3, Math.min(room.width - 0.3, camera.position.x));
    camera.position.z = Math.max(0.3, Math.min(room.depth - 0.3, camera.position.z));
    camera.position.y = 1.6;
  });
  return null;
}

export function Room3DPreview({ room }: { room: Room }) {
  const { data: loci } = useFetch<Locus[]>(`/api/loci?room=${room.id}`);
  const { data: openings } = useFetch<Opening[]>(`/api/openings?room=${room.id}`);
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const keysRef = useRef<Record<string, boolean>>({});
  const openList = useMemo(() => openings ?? [], [openings]);
  const locusList = useMemo(() => loci ?? [], [loci]);
  const selected = locusList.find((l) => l.id === selectedId) ?? null;

  function onLocusClick(e: ThreeEvent<MouseEvent>, locusId: string) {
    e.stopPropagation();
    setSelectedId(locusId);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          onClick={() => setMode("orbit")}
          className={mode === "orbit" ? "btn-primary px-3 py-1" : "btn-ghost"}
        >
          Orbit (experiment)
        </button>
        <button
          onClick={() => setMode("walk")}
          className={mode === "walk" ? "btn-primary px-3 py-1" : "btn-ghost"}
        >
          Walk WASD (experiment)
        </button>
        <span className="text-xs text-muted-foreground">
          {mode === "walk"
            ? "Click scene to lock pointer, WASD to move, Esc to release."
            : "Drag to orbit, scroll to zoom. Click a blue sphere."}
        </span>
      </div>
      <div
        className="h-[380px] w-full overflow-hidden rounded"
        tabIndex={0}
        onKeyDown={(e) => {
          keysRef.current[e.key.toLowerCase()] = true;
        }}
        onKeyUp={(e) => {
          keysRef.current[e.key.toLowerCase()] = false;
        }}
      >
        <Canvas camera={{ position: [room.width / 2 + 8, 6, room.depth / 2 + 8], fov: 55 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[12, 18, 8]} intensity={1.1} />
          {mode === "orbit" ? (
            <OrbitControls target={[room.width / 2, 1.2, room.depth / 2]} makeDefault />
          ) : (
            <>
              <PointerLockControls />
              <WalkKeys room={room} keysRef={keysRef} />
            </>
          )}
          <mesh position={[room.width / 2, -0.05, room.depth / 2]}>
            <boxGeometry args={[room.width, 0.1, room.depth]} />
            <meshStandardMaterial color={room.background ?? "#cfd4d0"} />
          </mesh>
          <WallWithGaps room={room} wall="north" openings={openList} />
          <WallWithGaps room={room} wall="south" openings={openList} />
          <WallWithGaps room={room} wall="east" openings={openList} />
          <WallWithGaps room={room} wall="west" openings={openList} />
          {locusList.map((locus) => (
            <mesh
              key={locus.id}
              position={locusPos(locus, room)}
              onClick={(e) => onLocusClick(e, locus.id)}
            >
              <sphereGeometry args={[0.22, 16, 16]} />
              <meshStandardMaterial color={locus.id === selectedId ? "#e07b39" : "#2f7fe0"} />
            </mesh>
          ))}
          {locusList.length === 0 && (
            <mesh position={[room.width / 2, 1.5, room.depth / 2]}>
              <sphereGeometry args={[0.3, 12, 12]} />
              <meshStandardMaterial color="#cc4444" />
            </mesh>
          )}
        </Canvas>
      </div>
      {selected && (
        <p className="mt-2 text-sm">
          Locus <strong>{selected.label}</strong> — wall {selected.wall ?? "?"} @{" "}
          {typeof selected.wall_offset === "number" ? selected.wall_offset.toFixed(2) : "?"} ·{" "}
          <button onClick={() => setSelectedId(null)} className="btn-ghost !px-2 !py-0.5 text-xs">
            clear
          </button>
        </p>
      )}
    </div>
  );
}
