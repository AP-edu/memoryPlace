"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Locus, Opening, Room } from "@/types/database";
import {
  FURNITURE,
  FURNITURE_KINDS,
  furnitureOf,
  nextRotation,
  placeAt,
  type FurnitureItem,
  type FurnitureKind,
} from "@/lib/furniture";
import { ROOM_COLORS } from "@/components/palace-editor/GridEditor";

// three.js is client-only and heavy: the canvas loads on demand.
const Palace3DView = dynamic(() => import("@/components/palace/Palace3DView"), {
  ssr: false,
  loading: () => <div className="h-[560px] animate-pulse rounded-lg border border-border bg-card" />,
});

const PIECE_COLORS = ["#9a6b3f", "#6b4a2b", "#d8c3a5", "#ece6d8", "#8c4a3c", "#b5523b", "#d9a82e", "#3f8f4a", "#3f6e8c", "#5b7fb5", "#7b5ea7", "#1d1d24"];
const HEIGHTS = [2.4, 2.7, 3, 3.5, 4, 5, 6];

const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * 3D palace studio: the whole level in 3D, and for the selected room a panel
 * to rename it, recolour it, change its height and furnish it — so a real,
 * familiar place (home, school, a museum) can be rebuilt and walked.
 * Size and position stay on the 2D blueprint, which keeps rooms from
 * overlapping and linked doors in step.
 */
export default function PalaceStudio({
  rooms,
  openings,
  loci,
  levelId,
  fallbackLevelId,
  selectedRoomId,
  onSelectRoom,
  onRoomSaved,
  onOpenBlueprint,
}: {
  rooms: Room[];
  openings: Opening[];
  loci: Locus[];
  levelId: string | null;
  fallbackLevelId: string | null;
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  /** A room changed (optimistically or from the server): keep the page's copy in step. */
  onRoomSaved: (room: Room) => void;
  /** Jump to the 2D blueprint (resize / move rooms there). */
  onOpenBlueprint: () => void;
}) {
  const room = rooms.find((r) => r.id === selectedRoomId) ?? null;
  // Furniture drafts per room (edited live, saved debounced).
  const [drafts, setDrafts] = useState<Record<string, FurnitureItem[]>>({});
  const [placing, setPlacing] = useState<FurnitureKind | null>(null);
  const [selected, setSelected] = useState<{ roomId: string; itemId: string } | null>(null);
  const [dragging, setDragging] = useState<{ roomId: string; itemId: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [title, setTitle] = useState(room?.title ?? "");
  const [prevRoomId, setPrevRoomId] = useState(selectedRoomId);
  if (selectedRoomId !== prevRoomId) {
    setPrevRoomId(selectedRoomId);
    setTitle(room?.title ?? "");
    setPlacing(null);
    if (selected && selected.roomId !== selectedRoomId) setSelected(null);
  }

  const furniture = useMemo(() => {
    const out: Record<string, FurnitureItem[]> = {};
    for (const r of rooms) out[r.id] = drafts[r.id] ?? furnitureOf(r);
    return out;
  }, [rooms, drafts]);
  const items = room ? furniture[room.id] ?? [] : [];
  const selectedItem = selected && room && selected.roomId === room.id ? items.find((i) => i.id === selected.itemId) ?? null : null;

  // ---------------------------------------------------------------- saving
  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const put = useCallback(
    async (roomId: string, patch: Record<string, unknown>) => {
      setStatus("saving");
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!res || !res.ok) {
        setStatus("error");
        return null;
      }
      const saved = (await res.json()) as Room;
      onRoomSaved(saved);
      setStatus("saved");
      return saved;
    },
    [onRoomSaved]
  );
  const saveFurniture = useCallback(
    (roomId: string, list: FurnitureItem[], delay = 450) => {
      clearTimeout(timers.current[roomId]);
      timers.current[roomId] = setTimeout(() => {
        const r = roomsRef.current.find((x) => x.id === roomId);
        if (r) void put(roomId, { metadata: { ...(r.metadata ?? {}), furniture: list } });
      }, delay);
    },
    [put]
  );
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const setItems = useCallback(
    (roomId: string, update: (list: FurnitureItem[]) => FurnitureItem[], delay?: number) => {
      setDrafts((d) => {
        const r = roomsRef.current.find((x) => x.id === roomId);
        if (!r) return d;
        const next = update(d[roomId] ?? furnitureOf(r));
        saveFurniture(roomId, next, delay);
        return { ...d, [roomId]: next };
      });
    },
    [saveFurniture]
  );

  /** Optimistic room edit (title / colour / height) with rollback on failure. */
  async function patchRoom(patch: Partial<Pick<Room, "title" | "background" | "height">>) {
    if (!room) return;
    const before = room;
    onRoomSaved({ ...room, ...patch });
    const saved = await put(room.id, patch);
    if (!saved) onRoomSaved(before);
  }

  // ---------------------------------------------------------------- 3D callbacks
  const onPlace = useCallback(
    (roomId: string, at: { x: number; z: number }) => {
      const r = roomsRef.current.find((x) => x.id === roomId);
      if (!r || !placing) return;
      const item = placeAt({ id: newId(), kind: placing, rot: 0, x: at.x, z: at.z } as FurnitureItem, at.x, at.z, r);
      setItems(roomId, (list) => [...list, item], 0);
      setSelected({ roomId, itemId: item.id });
      onSelectRoom(roomId);
    },
    [placing, setItems, onSelectRoom]
  );
  const onItemDown = useCallback(
    (roomId: string, item: FurnitureItem) => {
      onSelectRoom(roomId);
      setSelected({ roomId, itemId: item.id });
      setDragging({ roomId, itemId: item.id });
    },
    [onSelectRoom]
  );
  const onDrag = useCallback(
    (at: { x: number; z: number }) => {
      if (!dragging) return;
      const r = roomsRef.current.find((x) => x.id === dragging.roomId);
      if (!r) return;
      // Long debounce while dragging; the pointer-up below saves straight away.
      setItems(dragging.roomId, (list) => list.map((i) => (i.id === dragging.itemId ? placeAt(i, at.x, at.z, r) : i)), 5000);
    },
    [dragging, setItems]
  );
  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      const d = dragging;
      setDragging(null);
      document.body.style.cursor = "";
      setDrafts((all) => {
        const list = all[d.roomId];
        if (list) saveFurniture(d.roomId, list, 0);
        return all;
      });
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragging, saveFurniture]);

  // ---------------------------------------------------------------- keyboard
  const rotate = useCallback(() => {
    if (!selected) return;
    setItems(selected.roomId, (list) => {
      const r = roomsRef.current.find((x) => x.id === selected.roomId);
      return list.map((i) => (i.id === selected.itemId && r ? placeAt({ ...i, rot: nextRotation(i.rot) }, i.x, i.z, r) : i));
    });
  }, [selected, setItems]);
  const remove = useCallback(() => {
    if (!selected) return;
    setItems(selected.roomId, (list) => list.filter((i) => i.id !== selected.itemId), 0);
    setSelected(null);
  }, [selected, setItems]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        if (placing) setPlacing(null);
        else setSelected(null);
      } else if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey) {
        rotate();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          remove();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, selected, rotate, remove]);

  const statusText = { idle: "", saving: "Saving…", saved: "All changes saved", error: "Couldn't save — check your connection" }[status];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative">
        <Palace3DView
          rooms={rooms}
          openings={openings}
          levelId={levelId}
          fallbackLevelId={fallbackLevelId}
          selectedId={selectedRoomId}
          onSelect={(id) => {
            onSelectRoom(id);
            if (!id) setSelected(null);
          }}
          loci={loci}
          furnish={{ furniture, placing, selected, dragging, onPlace, onItemDown, onDrag }}
        />
        {placing && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <p className="pointer-events-auto flex items-center gap-3 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground shadow">
              Click a floor to place a {FURNITURE[placing].label.toLowerCase()}
              <button type="button" onClick={() => setPlacing(null)} className="rounded bg-card/80 px-1.5 py-0.5 text-xs text-foreground">
                Done (Esc)
              </button>
            </p>
          </div>
        )}
        {statusText && <p className="absolute bottom-3 right-3 rounded-lg bg-card/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">{statusText}</p>}
      </div>

      <aside className="card-base flex flex-col gap-4 p-4" aria-label="Room studio">
        {!room ? (
          <div>
            <h3 className="font-semibold">Room studio</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a room to redesign it: name it, colour it, set the ceiling height and furnish it like the real place you are
              remembering. Familiar places make the strongest palaces.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="studio-title" className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                Room
              </label>
              <input
                id="studio-title"
                className="input-base mt-1 text-lg font-semibold"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title.trim() !== room.title && void patchRoom({ title: title.trim() })}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Colour</p>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    aria-label={`${c.name} room colour`}
                    aria-pressed={(room.background ?? null) === c.value}
                    onClick={() => void patchRoom({ background: c.value })}
                    className={`h-7 w-7 rounded-full border-2 ${(room.background ?? null) === c.value ? "border-primary ring-2 ring-ring/40" : "border-border"}`}
                    style={{ background: c.value ?? "var(--card)" }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <label className="text-xs font-medium text-muted-foreground">
                Ceiling
                <select
                  className="input-base mt-1 !w-24"
                  value={HEIGHTS.includes(room.height) ? room.height : ""}
                  onChange={(e) => void patchRoom({ height: Number(e.target.value) })}
                  aria-label="Ceiling height"
                >
                  {!HEIGHTS.includes(room.height) && <option value="">{room.height} m</option>}
                  {HEIGHTS.map((h) => (
                    <option key={h} value={h}>
                      {h} m
                    </option>
                  ))}
                </select>
              </label>
              <p className="pb-2 text-xs text-muted-foreground">
                {room.width} × {room.depth} m ·{" "}
                <button type="button" className="text-link hover:underline" onClick={onOpenBlueprint}>
                  resize on the blueprint
                </button>
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Furnish — pick a piece, then click the floor</p>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Furniture palette">
                {FURNITURE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={placing === k}
                    onClick={() => setPlacing(placing === k ? null : k)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      placing === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50 hover:bg-muted"
                    }`}
                  >
                    {FURNITURE[k].label}
                  </button>
                ))}
              </div>
            </div>

            {selectedItem ? (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{FURNITURE[selectedItem.kind].label}</p>
                  <p className="text-xs text-muted-foreground">Drag it in 3D</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={rotate} className="btn-outline !px-3 !py-1 text-sm">
                    Rotate (R)
                  </button>
                  <button type="button" onClick={remove} className="btn-ghost text-sm text-destructive">
                    Remove (Del)
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PIECE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour ${c}`}
                      onClick={() => setItems(room.id, (list) => list.map((i) => (i.id === selectedItem.id ? { ...i, color: c } : i)))}
                      className={`h-6 w-6 rounded-full border-2 ${(selectedItem.color ?? FURNITURE[selectedItem.kind].color) === c ? "border-primary" : "border-border"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {items.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">In this room ({items.length})</p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
                  {items.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => setSelected({ roomId: room.id, itemId: i.id })}
                        aria-label={`Select ${FURNITURE[i.kind].label.toLowerCase()}`}
                        className={`w-full rounded-lg px-2 py-1 text-left ${selectedItem?.id === i.id ? "bg-primary/15" : "hover:bg-muted"}`}
                      >
                        {FURNITURE[i.kind].label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3 text-sm">
              <Link href={`/walk/${room.id}`} className="btn-primary !px-3 !py-1.5">
                {"▶"} Walk in
              </Link>
              <Link href={`/rooms/${room.id}?tool=place`} className="btn-outline !px-3 !py-1.5">
                Place loci
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
