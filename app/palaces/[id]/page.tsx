"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Opening, Palace, Room } from "@/types/database";
import { Room3DPreview } from "@/components/palace/Room3DPreview";

const THEMES = [
  { name: "Sand", value: "#e8dcc8" },
  { name: "Sage", value: "#cfd4c0" },
  { name: "Slate", value: "#c9d1d8" },
  { name: "Clay", value: "#dfc0b0" },
  { name: "Ink", value: "#3a3f4a" },
];

const WALLS = ["north", "south", "east", "west"] as const;

export default function PalacePage() {
  const { id } = useParams<{ id: string }>();
  const { data: palace } = useFetch<Palace>(id ? `/api/palaces/${id}` : null);
  const { data: rooms, loading, error, refetch } = useFetch<Room[]>(
    id ? `/api/rooms?palace=${id}` : null
  );

  const [title, setTitle] = useState("");
  const [width, setWidth] = useState(10);
  const [depth, setDepth] = useState(8);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewRoomId, setPreviewRoomId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError("Title required");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, palace_id: id, width, depth, height: 3 }),
    });
    if (!res.ok) return setFormError("Failed to create room");
    setFormError(null);
    setTitle("");
    refetch();
  }

  async function handleResize(room: Room, w: number, d: number) {
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width: w, depth: d }),
    });
    if (!res.ok) return setFormError("Failed to resize room");
    setFormError(null);
    refetch();
  }

  async function handleTheme(room: Room, background: string) {
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background }),
    });
    if (!res.ok) return setFormError("Failed to set theme");
    setFormError(null);
    refetch();
  }

  async function handleDelete(roomId: string) {
    if (!confirm("Delete this room, its loci, and its cards?")) return;
    const res = await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete room");
    refetch();
  }

  if (!id) return <p className="p-6">This palace link is missing an id.</p>;
  if (loading) return <p className="p-6 text-muted-foreground">Loading blueprint...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load rooms: {error}</p>;

  const maxW = Math.max(1, ...(rooms ?? []).map((r) => r.width));
  const previewRoom = rooms?.find((r) => r.id === previewRoomId) ?? null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link href="/palaces" className="btn-ghost">
        {"← Back to palaces"}
      </Link>
      <h1 className="mb-1 mt-3 text-3xl font-semibold">{palace?.title ?? "Palace"} Blueprint</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Top-down 2D blueprint — x→right, z→down. Tiles scale with width/depth. Loci stay wall-anchored on
        resize.
      </p>

      <form onSubmit={handleCreate} className="card-base mb-6 flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-40 flex-1">
          <label className="text-xs text-muted-foreground">New room title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Atrium"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">W</label>
          <input
            type="number"
            min={2}
            max={30}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="input-base w-20"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">D</label>
          <input
            type="number"
            min={2}
            max={30}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="input-base w-20"
          />
        </div>
        <button className="btn-primary">Add room</button>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      {rooms?.length === 0 && (
        <p className="text-muted-foreground">No rooms yet — raise the first one above.</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rooms?.map((room) => (
          <RoomTile
            key={room.id}
            room={room}
            maxW={maxW}
            onResize={handleResize}
            onTheme={handleTheme}
            onDelete={handleDelete}
            onPreview={() => setPreviewRoomId(room.id)}
            previewing={previewRoomId === room.id}
          />
        ))}
      </div>

      {previewRoom && (
        <div className="card-base mt-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">3D preview — {previewRoom.title}</h2>
            <button onClick={() => setPreviewRoomId(null)} className="btn-ghost">
              Close
            </button>
          </div>
          <Room3DPreview room={previewRoom} />
          <div className="mt-3 flex gap-3 text-sm">
            <Link href={`/spike-3d/${previewRoom.id}`} className="btn-primary px-3 py-1.5">
              Open full 3D walk →
            </Link>
            <Link href={`/rooms/${previewRoom.id}`} className="btn-ghost">
              Design loci
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomTile({
  room,
  maxW,
  onResize,
  onTheme,
  onDelete,
  onPreview,
  previewing,
}: {
  room: Room;
  maxW: number;
  onResize: (room: Room, w: number, d: number) => void;
  onTheme: (room: Room, bg: string) => void;
  onDelete: (id: string) => void;
  onPreview: () => void;
  previewing: boolean;
}) {
  const [w, setW] = useState(room.width);
  const [d, setD] = useState(room.depth);
  const { data: openings, refetch } = useFetch<Opening[]>(`/api/openings?room=${room.id}`);

  async function addOpening(wall: (typeof WALLS)[number]) {
    await fetch("/api/openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: room.id, wall, kind: "door" }),
    });
    refetch();
  }

  async function toggleKind(o: Opening) {
    await fetch(`/api/openings/${o.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: o.kind === "door" ? "archway" : "door" }),
    });
    refetch();
  }

  async function deleteOpening(openingId: string) {
    await fetch(`/api/openings/${openingId}`, { method: "DELETE" });
    refetch();
  }

  // Scale tile: 1 unit ≈ 14px, capped for layout.
  const scale = 14;
  const tileW = Math.max(80, Math.min(320, room.width * scale));
  const tileH = Math.max(60, Math.min(240, room.depth * scale));

  return (
    <div className="card-base p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-medium">{room.title}</h3>
          <p className="text-xs text-muted-foreground">
            {room.width} × {room.depth} × {room.height} units
          </p>
        </div>
        <button onClick={() => onDelete(room.id)} className="btn-danger">
          Delete
        </button>
      </div>

      {/* 2D top-down tile */}
      <div className="mt-3 flex justify-center rounded bg-muted/40 p-4">
        <div
          className="relative rounded-sm border-2 border-foreground/60"
          style={{ width: tileW, height: tileH, background: room.background ?? "#e8dcc8" }}
          title={`${room.title} top-down (x→right, z→down)`}
        >
          <span className="absolute left-1 top-1 text-[10px] font-semibold opacity-60">N ↑</span>
          {(openings ?? []).map((o) => (
            <OpeningMark key={o.id} opening={o} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex items-center gap-1">
          W
          <input
            type="number"
            min={2}
            max={30}
            value={w}
            onChange={(e) => setW(Number(e.target.value))}
            className="input-base w-16"
          />
        </label>
        <label className="flex items-center gap-1">
          D
          <input
            type="number"
            min={2}
            max={30}
            value={d}
            onChange={(e) => setD(Number(e.target.value))}
            className="input-base w-16"
          />
        </label>
        <button onClick={() => onResize(room, w, d)} className="btn-ghost">
          Resize
        </button>
        <span className="ml-2 text-xs text-muted-foreground">maxW {maxW}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.value}
            title={t.name}
            onClick={() => onTheme(room, t.value)}
            className={`h-6 w-6 rounded-full border-2 ${
              room.background === t.value ? "border-primary" : "border-foreground/20"
            }`}
            style={{ background: t.value }}
          />
        ))}
      </div>

      <div className="mt-3 border-t pt-2 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">Doors / archways per wall</p>
        <div className="flex flex-wrap gap-1.5">
          {WALLS.map((wall) => (
            <button key={wall} onClick={() => addOpening(wall)} className="btn-ghost !px-2 !py-1 text-xs">
              + {wall}
            </button>
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          {(openings ?? []).map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-xs">
              <span className="font-medium">
                {o.wall} · {o.kind}
              </span>
              <button onClick={() => toggleKind(o)} className="btn-ghost !px-2 !py-0.5">
                → {o.kind === "door" ? "archway" : "door"}
              </button>
              <button onClick={() => deleteOpening(o.id)} className="btn-danger !px-2 !py-0.5">
                ×
              </button>
            </div>
          ))}
          {(openings ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No openings yet.</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href={`/rooms/${room.id}`} className="btn-ghost">
          Design loci
        </Link>
        <Link href={`/study/${room.id}`} className="btn-ghost">
          Study
        </Link>
        <button onClick={onPreview} className={previewing ? "btn-primary px-3 py-1.5" : "btn-primary px-3 py-1.5"}>
          {previewing ? "Previewing…" : "3D preview"}
        </button>
      </div>
    </div>
  );
}

function OpeningMark({ opening }: { opening: Opening }) {
  const pos: React.CSSProperties = {};
  if (opening.wall === "north") {
    pos.left = `${opening.wall_offset * 100}%`;
    pos.top = "0";
    pos.transform = "translate(-50%, -50%)";
  } else if (opening.wall === "south") {
    pos.left = `${opening.wall_offset * 100}%`;
    pos.bottom = "0";
    pos.transform = "translate(-50%, 50%)";
  } else if (opening.wall === "east") {
    pos.top = `${opening.wall_offset * 100}%`;
    pos.right = "0";
    pos.transform = "translate(50%, -50%)";
  } else {
    pos.top = `${opening.wall_offset * 100}%`;
    pos.left = "0";
    pos.transform = "translate(-50%, -50%)";
  }
  const horizontal = opening.wall === "north" || opening.wall === "south";
  return (
    <span
      className={`absolute rounded-sm ${
        opening.kind === "door" ? "bg-amber-700" : "bg-sky-500"
      }`}
      style={{
        ...pos,
        width: horizontal ? 22 : 6,
        height: horizontal ? 6 : 22,
      }}
      title={`${opening.wall} ${opening.kind}`}
    />
  );
}
