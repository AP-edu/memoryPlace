"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { useFetch } from "@/hooks/useFetch";
import type { Locus, Room } from "@/types/database";

// THROWAWAY SPIKE (Phase A): validates the v2 geometry model can be rendered
// in 3D before Phase F commits to it. Delete or replace freely.

function locusPos(l: Locus, r: Room): [number, number, number] {
  const w = l.wall ?? "north";
  const off = typeof l.wall_offset === "number" ? l.wall_offset : 0;
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

function EastWall({ room }: { room: Room }) {
  const gap = 1.2;
  const seg1Len = Math.max(0.1, room.depth / 2 - gap / 2);
  const seg2Len = Math.max(0.1, room.depth / 2 - gap / 2);
  const seg1Center = seg1Len / 2;
  const seg2Center = room.depth - seg2Len / 2;
  return (
    <>
      <mesh position={[room.width, room.height / 2, seg1Center]}>
        <boxGeometry args={[0.2, room.height, seg1Len]} />
        <meshStandardMaterial color="#8a6d4f" />
      </mesh>
      <mesh position={[room.width, room.height / 2, seg2Center]}>
        <boxGeometry args={[0.2, room.height, seg2Len]} />
        <meshStandardMaterial color="#8a6d4f" />
      </mesh>
    </>
  );
}

function RoomWireframe({ room, loci }: { room: Room; loci: Locus[] }) {
  return (
    <group>
      <mesh position={[room.width / 2, -0.05, room.depth / 2]}>
        <boxGeometry args={[room.width, 0.1, room.depth]} />
        <meshStandardMaterial color="#cfd4d0" />
      </mesh>
      <mesh position={[room.width / 2, room.height / 2, room.depth]}>
        <boxGeometry args={[room.width, room.height, 0.2]} />
        <meshStandardMaterial color="#8a6d4f" />
      </mesh>
      <mesh position={[room.width / 2, room.height / 2, 0]}>
        <boxGeometry args={[room.width, room.height, 0.2]} />
        <meshStandardMaterial color="#8a6d4f" />
      </mesh>
      <mesh position={[0, room.height / 2, room.depth / 2]}>
        <boxGeometry args={[0.2, room.height, room.depth]} />
        <meshStandardMaterial color="#8a6d4f" />
      </mesh>
      <EastWall room={room} />
      {loci.map((locus) => (
        <mesh key={locus.id} position={locusPos(locus, room)}>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshStandardMaterial color={[0.2, 0.55, 0.9]} />
        </mesh>
      ))}
      {loci.length === 0 && (
        <mesh position={[room.width / 2, 1.5, room.depth / 2]}>
          <sphereGeometry args={[0.3, 12, 12]} />
          <meshStandardMaterial color="#cc4444" />
        </mesh>
      )}
    </group>
  );
}

function SpinCamera({ room }: { room: Room }) {
  useFrame(({ camera }) => {
    const cx = room.width / 2;
    const cy = room.height * 0.7;
    const cz = room.depth / 2;
    const radius = Math.max(room.width, room.depth) * 1.6;
    const t = Date.now() * 0.0002;
    camera.position.set(cx + radius * Math.cos(t), cy, cz + radius * Math.sin(t));
    camera.lookAt(cx, cy, cz);
  });
  return null;
}

export default function Spike3DPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { data: room, loading: loadingRoom, error: roomError } = useFetch<Room>(
    roomId ? `/api/rooms/${roomId}` : null
  );
  const { data: loci, loading: loadingLoci, error: lociError } = useFetch<Locus[]>(
    roomId ? `/api/loci?room=${roomId}` : null
  );

  if (!roomId) return <p className="p-6">Missing room id.</p>;
  if (loadingRoom || loadingLoci) return <p className="p-6 text-muted-foreground">Loading room...</p>;
  if (roomError || lociError || !room) {
    return <p className="p-6 text-destructive">Failed to load: {roomError ?? lociError}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{room.title}</h1>
        <Link href={`/rooms/${room.id}`} className="btn-ghost">
          Back to room editor (2D)
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Phase A spike — throwaway 3D render of the v2 geometry. Loci are the blue spheres; the east wall has a test
        door gap.
      </p>
      <div className="card-base h-[520px] w-full overflow-hidden">
        <Canvas camera={{ position: [20, 8, 20], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[12, 18, 8]} intensity={1.1} color="#ffffff" />
          <SpinCamera room={room} />
          <RoomWireframe room={room} loci={loci ?? []} />
        </Canvas>
      </div>
    </div>
  );
}