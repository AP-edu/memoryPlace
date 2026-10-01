"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Opening, OpeningKind, Palace, Room, WallFace } from "@/types/database";

const UNIT = 22;

function openingPos(op: Opening): React.CSSProperties {
  const o = (op.wall_offset ?? 0.5) * 100;
  switch (op.wall) {
    case "north":
      return { top: 0, left: `${o}%` };
    case "south":
      return { bottom: 0, left: `${o}%` };
    case "east":
      return { right: 0, top: `${o}%` };
    case "west":
      return { left: 0, top: `${o}%` };
  }
}

function OpeningGlyph({ op }: { op: Opening }) {
  return (
    <span
      className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/60 bg-background text-[10px] font-bold text-primary shadow-sm"
      style={openingPos(op)}
      title={`${op.kind} at ${(op.wall_offset ?? 0.5).toFixed(2)} on ${op.wall}`}
    >
      {op.kind === "door" ? "D" : "A"}
    </span>
  );
}

function RoomTile({
  room,
  openings,
}: {
  room: Room;
  openings: Opening[];
}) {
  const w = Math.max(room.width, 2) * UNIT;
  const d = Math.max(room.depth, 2) * UNIT;
  return (
    <Link
      href={`/rooms/${room.id}`}
      className="card-base group relative flex items-center justify-center transition-colors hover:border-primary/60 hover:shadow-card-hover"
      style={{ width: w, height: d, minWidth: 64, minHeight: 48 }}
      aria-label={`Open room editor for ${room.title}`}
    >
      <div className="px-2 text-center">
        <p className="truncate text-xs font-medium group-hover:text-primary">{room.title}</p>
        <p className="text-[10px] text-muted-foreground">
          {room.width} × {room.depth}
        </p>
      </div>
      {openings.map((op) => (
        <OpeningGlyph key={op.id} op={op} />
      ))}
    </Link>
  );
}

function RoomRow({
  room,
  openings,
  onChanged,
  onDeleted,
}: {
  room: Room;
  openings: Opening[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(room.title);
  const [w, setW] = useState(String(room.width));
  const [d, setD] = useState(String(room.depth));
  const [h, setH] = useState(String(room.height));
  const [err, setErr] = useState<string | null>(null);
  const [newWall, setNewWall] = useState<WallFace>("north");
  const [newKind, setNewKind] = useState<OpeningKind>("door");
  const [newOffset, setNewOffset] = useState("0.5");

  async function saveRoom() {
    const width = Number(w);
    const depth = Number(d);
    const height = Number(h);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0 || !Number.isFinite(height) || height <= 0) {
      return setErr("Width, depth, and height must be positive numbers.");
    }
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || room.title, width, depth, height }),
    });
    if (!res.ok) return setErr("Failed to save room changes.");
    setErr(null);
    onChanged();
  }

  async function addOpening() {
    const offset = Number(newOffset);
    if (!Number.isFinite(offset)) return setErr("Opening offset must be a number.");
    const res = await fetch("/api/openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: room.id, wall: newWall, kind: newKind, wall_offset: offset }),
    });
    if (!res.ok) return setErr("Failed to add opening.");
    setErr(null);
    onChanged();
  }

  async function toggleOpening(op: Opening) {
    await fetch(`/api/openings/${op.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: op.kind === "door" ? "archway" : "door" }),
    });
    onChanged();
  }

  async function deleteOpening(op: Opening) {
    if (!confirm(`Remove this ${op.kind} from ${op.wall}?`)) return;
    await fetch(`/api/openings/${op.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="card-base p-4">
      <div className="flex flex-wrap items-end gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-base max-w-52" aria-label="Room title" />
        <input value={w} onChange={(e) => setW(e.target.value)} type="number" min={1} step={1} className="input-base w-20" aria-label="Width" />
        <span className="text-sm text-muted-foreground">×</span>
        <input value={d} onChange={(e) => setD(e.target.value)} type="number" min={1} step={1} className="input-base w-20" aria-label="Depth" />
        <span className="text-sm text-muted-foreground">×</span>
        <input value={h} onChange={(e) => setH(e.target.value)} type="number" min={0.5} step={0.1} className="input-base w-20" aria-label="Height" />
        <span className="text-xs text-muted-foreground">w × d × h</span>
        <button onClick={saveRoom} className="btn-primary !px-3 !py-2">
          Save
        </button>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link href={`/rooms/${room.id}`} className="btn-ghost">
            Editor
          </Link>
          <Link href={`/study/${room.id}`} className="btn-outline !px-3 !py-1.5">
            Study
          </Link>
          <Link href={`/spike-3d/${room.id}`} className="btn-ghost">
            3D
          </Link>
          <button
            onClick={() => {
              if (!confirm("Delete this room, its loci, and its cards?")) return;
              fetch(`/api/rooms/${room.id}`, { method: "DELETE" }).then((r) => {
                if (r.ok) onDeleted();
              });
            }}
            className="btn-danger"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Openings</span>
        {openings.length === 0 && <span className="text-sm text-muted-foreground">None yet.</span>}
        {openings.map((op) => (
          <span key={op.id} className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs">
            {op.kind} · {op.wall} @ {(op.wall_offset ?? 0.5).toFixed(2)}
            <button onClick={() => toggleOpening(op)} className="font-medium text-primary hover:underline" title="Toggle door/archway">
              ⇄
            </button>
            <button onClick={() => deleteOpening(op)} className="text-destructive hover:underline" title="Delete opening">
              ×
            </button>
          </span>
        ))}
        <select value={newWall} onChange={(e) => setNewWall(e.target.value as WallFace)} className="input-base w-24" aria-label="New opening wall">
          <option value="north">north</option>
          <option value="south">south</option>
          <option value="east">east</option>
          <option value="west">west</option>
        </select>
        <select value={newKind} onChange={(e) => setNewKind(e.target.value as OpeningKind)} className="input-base w-28" aria-label="New opening kind">
          <option value="door">door</option>
          <option value="archway">archway</option>
        </select>
        <input value={newOffset} onChange={(e) => setNewOffset(e.target.value)} type="number" min={0} max={1} step={0.05} className="input-base w-20" aria-label="New opening offset" />
        <button onClick={addOpening} className="btn-outline !px-3 !py-1.5">
          Add opening
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}

export default function PalacePage() {
  const { id } = useParams<{ id: string }>();
  const { data: palace, refetch: refetchPalace } = useFetch<Palace>(id ? `/api/palaces/${id}` : null);
  const { data: rooms, loading, error, refetch } = useFetch<Room[]>(id ? `/api/rooms?palace=${id}` : null);
  const { data: openings, refetch: refetchOpenings } = useFetch<Opening[]>(id ? `/api/openings?palace=${id}` : null);

  const [palaceTitle, setPalaceTitle] = useState("");
  const [palaceDesc, setPalaceDesc] = useState("");
  const seeded = useRef(false);
  const palaceDirty = palace ? palaceTitle !== palace.title || palaceDesc !== (palace.description ?? "") : false;
  const [palaceErr, setPalaceErr] = useState<string | null>(null);

  useEffect(() => {
    if (palace && !seeded.current) {
      seeded.current = true;
      setPalaceTitle(palace.title ?? "");
      setPalaceDesc(palace.description ?? "");
    }
  }, [palace]);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newW, setNewW] = useState("10");
  const [newD, setNewD] = useState("8");
  const [newH, setNewH] = useState("3");
  const [addErr, setAddErr] = useState<string | null>(null);

  const sortedRooms = useMemo(() => [...(rooms ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)), [rooms]);
  const openingsByRoom = useMemo(() => {
    const map = new Map<string, Opening[]>();
    for (const op of openings ?? []) {
      const list = map.get(op.room_id) ?? [];
      list.push(op);
      map.set(op.room_id, list);
    }
    return map;
  }, [openings]);

  function notifyRoomChanged() {
    refetch();
    refetchOpenings();
  }

  async function savePalace() {
    const res = await fetch(`/api/palaces/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: palaceTitle.trim() || palace?.title, description: palaceDesc.trim() || null }),
    });
    if (!res.ok) return setPalaceErr("Failed to save palace.");
    setPalaceErr(null);
    if (palace) seeded.current = false;
    refetchPalace();
  }

  async function addRoom() {
    if (!newTitle.trim()) return setAddErr("Title required.");
    const width = Number(newW);
    const depth = Number(newD);
    const height = Number(newH);
    if (![width, depth, height].every((n) => Number.isFinite(n) && n > 0)) return setAddErr("Dimensions must be positive numbers.");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), palace_id: id, width, depth, height }),
    });
    if (!res.ok) return setAddErr("Failed to create room.");
    setAddErr(null);
    setNewTitle("");
    setShowAdd(false);
    refetch();
  }

  if (!id) return <p className="p-6">This palace link is missing an id.</p>;
  if (loading) return <p className="p-6 text-muted-foreground">Loading palace...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load palace: {error}</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href="/palaces" className="btn-ghost">
        {"\u2190 Back to palaces"}
      </Link>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={palaceTitle}
          onChange={(e) => setPalaceTitle(e.target.value)}
          placeholder="Palace title"
          className="input-base max-w-72"
          aria-label="Palace title"
        />
        <input
          value={palaceDesc}
          onChange={(e) => setPalaceDesc(e.target.value)}
          placeholder="Description (optional)"
          className="input-base max-w-80"
          aria-label="Palace description"
        />
        <button onClick={savePalace} disabled={!palaceDirty} className="btn-primary">
          Save palace
        </button>
        <Link href={`/study/palace/${id}`} className="btn-outline">
          Study due
        </Link>
      </div>
      {palaceErr && <p className="mt-2 text-sm text-destructive">{palaceErr}</p>}

      <h1 className="mt-6 mb-1 text-3xl font-semibold">{palace?.title ?? "Palace"} — 2D Blueprint</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Rooms are drawn to scale (width × depth). Door/archway markers sit on their walls.
      </p>

      <div className="flex flex-wrap items-start gap-4 overflow-x-auto pb-2">
        {sortedRooms.map((room) => (
          <RoomTile key={room.id} room={room} openings={openingsByRoom.get(room.id) ?? []} />
        ))}
        {showAdd ? (
          <div className="card-base w-56 border-dashed p-3">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Room title" className="input-base mb-2" aria-label="New room title" />
            <div className="mb-2 grid grid-cols-3 gap-2">
              <input value={newW} onChange={(e) => setNewW(e.target.value)} type="number" min={1} className="input-base px-2 py-1 text-center" aria-label="Width" />
              <input value={newD} onChange={(e) => setNewD(e.target.value)} type="number" min={1} className="input-base px-2 py-1 text-center" aria-label="Depth" />
              <input value={newH} onChange={(e) => setNewH(e.target.value)} type="number" min={0.5} step={0.1} className="input-base px-2 py-1 text-center" aria-label="Height" />
            </div>
            <p className="mb-2 text-[10px] text-muted-foreground">w × d × h</p>
            <div className="flex gap-2">
              <button onClick={addRoom} className="btn-primary flex-1 !px-2 !py-1.5 !text-xs">
                Add room
              </button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost !text-xs">
                Cancel
              </button>
            </div>
            {addErr && <p className="mt-2 text-xs text-destructive">{addErr}</p>}
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="card-base flex h-24 w-40 items-center justify-center border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
          >
            + Add room
          </button>
        )}
      </div>

      <h2 className="mt-8 mb-3 text-xl font-semibold">Rooms</h2>
      <div className="space-y-3">
        {sortedRooms.map((room) => (
          <RoomRow key={room.id} room={room} openings={openingsByRoom.get(room.id) ?? []} onChanged={notifyRoomChanged} onDeleted={notifyRoomChanged} />
        ))}
        {sortedRooms.length === 0 && <p className="text-muted-foreground">No rooms yet — add your first chamber above.</p>}
      </div>
    </div>
  );
}