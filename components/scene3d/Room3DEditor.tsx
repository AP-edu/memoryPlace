"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Card, Locus, Opening, Room, WallFace } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";
import { wallLength } from "@/lib/geometry";
import { anchorFromPoint, reorderPositions, toScene, tourOrder, type WallAnchor } from "@/lib/scene3d";
import { LocusMarkers, RoomShell, SceneLights, type WallPointerEvent } from "./RoomShell";
import { useSceneColors } from "./useSceneColors";
import type { LociActions } from "./actions";

const WALL_NAMES: Record<WallFace, string> = { north: "North", south: "South", east: "East", west: "West" };

/** Comma-separated options input <-> string[] (max 3). */
function splitOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}
function cardOptionsText(card: Card): string {
  return Array.isArray(card.options) ? card.options.filter((o) => typeof o === "string").join(", ") : "";
}

type Tool = "select" | "place";

/**
 * 3D room editor: click a wall to place a locus, drag markers along the walls,
 * reorder the study path and attach flashcards. Controlled: data comes in as
 * props and every edit goes through `actions` (the same API the 2D editor
 * uses), so both views always show the same rows.
 */
export default function Room3DEditor({
  room,
  loci,
  openings,
  cards,
  actions,
  className = "",
  height = 520,
}: {
  room: Room;
  loci: Locus[];
  openings: Opening[];
  cards: Card[];
  actions: LociActions;
  className?: string;
  height?: number;
}) {
  const colors = useSceneColors();
  const [tool, setTool] = useState<Tool>(loci.length === 0 ? "place" : "select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<WallAnchor | null>(null);
  /** Inline "add cards" form that opens right after a locus is placed. */
  const [quick, setQuick] = useState<QuickCard | null>(null);
  const cardCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cards) if (c.locus_id) m[c.locus_id] = (m[c.locus_id] ?? 0) + 1;
    return m;
  }, [cards]);

  // Optimistic anchor overrides, keyed to the locus object they were made
  // against: once the parent passes a fresh object for that id, the override
  // is dropped automatically.
  const [pending, setPending] = useState<Record<string, { base: Locus; anchor: Partial<Locus> }>>({});
  const [dragging, setDragging] = useState<{ id: string; anchor: WallAnchor | null } | null>(null);

  const shown = useMemo(
    () =>
      loci.map((l) => {
        if (dragging?.id === l.id && dragging.anchor) return { ...l, ...dragging.anchor };
        const p = pending[l.id];
        return p && p.base === l ? { ...l, ...p.anchor } : l;
      }),
    [loci, pending, dragging]
  );
  const ordered = useMemo(() => tourOrder(shown), [shown]);
  const selected = shown.find((l) => l.id === selectedId) ?? null;
  const selectedIndex = selected ? ordered.findIndex((l) => l.id === selected.id) : -1;
  const selectedCards = cards.filter((c) => c.locus_id === selectedId);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  const commit = useCallback(
    (locus: Locus, patch: Partial<Locus>) => {
      const base = loci.find((l) => l.id === locus.id);
      if (!base) return;
      setPending((p) => ({ ...p, [locus.id]: { base, anchor: { ...(p[locus.id]?.base === base ? p[locus.id].anchor : {}), ...patch } } }));
      void run(() => actions.updateLocus(locus.id, patch));
    },
    [actions, loci, run]
  );

  // Debounced commit for sliders / keyboard nudges.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<{ locus: Locus; patch: Partial<Locus> } | null>(null);
  const commitSoon = useCallback(
    (locus: Locus, patch: Partial<Locus>) => {
      const base = loci.find((l) => l.id === locus.id);
      if (!base) return;
      setPending((p) => ({ ...p, [locus.id]: { base, anchor: { ...(p[locus.id]?.base === base ? p[locus.id].anchor : {}), ...patch } } }));
      queued.current = { locus, patch: { ...(queued.current?.locus.id === locus.id ? queued.current.patch : {}), ...patch } };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const q = queued.current;
        queued.current = null;
        if (q) void run(() => actions.updateLocus(q.locus.id, q.patch));
      }, 350);
    },
    [actions, loci, run]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const anchorOf = (e: WallPointerEvent) => anchorFromPoint(e.wall, e.point, room);

  function onWallClick(e: WallPointerEvent) {
    const ev = e.event as ThreeEvent<MouseEvent>;
    if (ev.delta > 4 || dragging) return; // orbit drag, not a click
    ev.stopPropagation();
    if (tool !== "place") {
      setSelectedId(null);
      return;
    }
    const a = anchorOf(e);
    const position = loci.reduce((m, l) => Math.max(m, l.position), -1) + 1;
    const leftover = quick;
    void run(async () => {
      // Placing the next locus keeps whatever was typed for the previous one.
      if (leftover && leftover.front.trim()) {
        await actions.createCard({ locus_id: leftover.locusId, front: leftover.front.trim(), back: leftover.back.trim() });
      }
      const created = await actions.createLocus({
        room_id: room.id,
        label: `Locus ${loci.length + 1}`,
        wall: a.wall,
        wall_offset: a.wall_offset,
        height: a.height,
        position,
      });
      setSelectedId(created.id);
      // Stay in place mode and open the inline card form straight away.
      setQuick({ locusId: created.id, label: created.label, front: "", back: "" });
    });
  }

  function onWallMove(e: WallPointerEvent) {
    const a = anchorOf(e);
    if (dragging) {
      e.event.stopPropagation();
      setDragging({ id: dragging.id, anchor: a });
    } else if (tool === "place") {
      setHover(a);
    }
  }

  function onMarkerDown(locus: Locus, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setSelectedId(locus.id);
    setDragging({ id: locus.id, anchor: null });
  }

  // Finish a drag wherever the pointer is released.
  useEffect(() => {
    if (!dragging) return;
    // No accidental text selection while dragging a marker.
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const up = () => {
      const d = dragging;
      setDragging(null);
      const locus = loci.find((l) => l.id === d?.id);
      if (d?.anchor && locus) commit(locus, d.anchor);
    };
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, loci, commit]);

  // Keyboard nudges on the selected locus (←/→ along wall, ↑/↓ height).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const wall = selected.wall ?? "north";
      const len = wallLength(wall, room);
      const step = e.shiftKey ? 0.5 : 0.1;
      const off = selected.wall_offset ?? 0.5;
      const h = selected.height ?? 1.5;
      let patch: Partial<Locus> | null = null;
      if (e.key === "ArrowLeft") patch = { wall_offset: Math.max(0, Math.min(1, off - step / len)) };
      if (e.key === "ArrowRight") patch = { wall_offset: Math.max(0, Math.min(1, off + step / len)) };
      if (e.key === "ArrowUp") patch = { height: Math.min(room.height - 0.2, +(h + step / 2).toFixed(2)) };
      if (e.key === "ArrowDown") patch = { height: Math.max(0.3, +(h - step / 2).toFixed(2)) };
      if (e.key === "Escape") setSelectedId(null);
      if (patch) {
        e.preventDefault();
        commitSoon(selected, patch);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, room, commitSoon]);

  function move(id: string, dir: -1 | 1) {
    const updates = reorderPositions(loci, id, dir);
    if (updates.length) void run(() => actions.setPositions(updates));
  }

  const camDist = Math.max(room.width, room.depth) * 1.15 + 3;
  const target = toScene({ x: room.width / 2, y: room.height * 0.35, z: room.depth / 2 });

  return (
    <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] ${className}`}>
      <div className="relative select-none overflow-hidden rounded-2xl border border-border bg-card" style={{ height }}>
        <Canvas
          camera={{ position: toScene({ x: room.width / 2 + camDist * 0.35, y: camDist * 0.75, z: room.depth / 2 - camDist * 0.8 }), fov: 50 }}
          onPointerMissed={() => tool === "select" && !dragging && setSelectedId(null)}
          onPointerLeave={() => setHover(null)}
          style={{ cursor: dragging ? "grabbing" : tool === "place" ? "crosshair" : "default", touchAction: "none" }}
        >
          <color attach="background" args={[colors.sky]} />
          <fog attach="fog" args={[colors.fog, camDist * 1.5, camDist * 4]} />
          <SceneLights colors={colors} />
          <RoomShell room={room} openings={openings} colors={colors} cutaway onWallClick={onWallClick} onWallMove={onWallMove} />
          <LocusMarkers
            room={room}
            loci={shown}
            colors={colors}
            selectedId={selectedId}
            draggingId={dragging?.id}
            onMarkerDown={onMarkerDown}
            onMarkerClick={(_, e) => e.stopPropagation()}
            cardCounts={cardCounts}
          />
          {tool === "place" && hover && !dragging && (
            <LocusMarkers
              room={room}
              loci={[{ ...(loci[0] ?? ({} as Locus)), id: "__ghost", label: "", position: 1e9, created_at: "", ...hover }]}
              colors={{ ...colors, locus: colors.locusActive }}
              showPath={false}
              showLabels={false}
              draggingId="__ghost"
            />
          )}
          <gridHelper args={[Math.max(room.width, room.depth) * 3, Math.max(room.width, room.depth) * 3, colors.grid, colors.grid]} position={[room.width / 2, -0.11, -room.depth / 2]} />
          <OrbitControls makeDefault enabled={!dragging} target={target} maxPolarAngle={Math.PI / 2.05} minDistance={2} maxDistance={camDist * 2.5} />
        </Canvas>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
          <div className="pointer-events-auto inline-flex rounded-xl border border-border bg-card/90 p-1 text-sm shadow-sm backdrop-blur">
            {(["select", "place"] as Tool[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTool(t)}
                aria-pressed={tool === t}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${tool === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t === "select" ? "Select / drag" : "+ Locus & cards"}
              </button>
            ))}
          </div>
          <p className="pointer-events-none rounded-lg bg-card/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
            {tool === "place"
              ? "Click a wall to drop a locus, then type its cards. Drag to orbit."
              : "Drag a marker along the walls · ←/→ slide · ↑/↓ height · drag empty space to orbit"}
          </p>
        </div>
        {quick && loci.some((l) => l.id === quick.locusId) && (
          <QuickCardForm
            key={quick.locusId}
            quick={quick}
            count={cardCounts[quick.locusId] ?? 0}
            number={ordered.findIndex((l) => l.id === quick.locusId) + 1}
            onChange={setQuick}
            onRename={(label) => {
              const l = loci.find((x) => x.id === quick.locusId);
              if (l && label.trim() && label !== l.label) commit(l, { label: label.trim() });
            }}
            onSave={(front, back) => run(() => actions.createCard({ locus_id: quick.locusId, front, back }))}
            onClose={() => setQuick(null)}
          />
        )}
        {busy && <div className="absolute bottom-3 right-3 rounded-lg bg-card/90 px-2 py-1 text-xs text-muted-foreground">Saving…</div>}
      </div>

      <aside className="card-base flex max-h-[min(80vh,720px)] flex-col gap-4 overflow-y-auto p-4">
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Study path ({ordered.length})</h3>
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loci yet. Pick “+ Place locus” and click a wall.</p>
          ) : (
            <ol className="space-y-1">
              {ordered.map((l, i) => (
                <li
                  key={l.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${l.id === selectedId ? "bg-primary/15 ring-1 ring-primary/50" : "hover:bg-muted"}`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedId(l.id)}>
                    {l.label || "Untitled"}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {cards.filter((c) => c.locus_id === l.id).length || "no"} card{cards.filter((c) => c.locus_id === l.id).length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <button type="button" aria-label={`Move ${l.label} earlier`} disabled={i === 0 || busy} onClick={() => move(l.id, -1)} className="btn-ghost h-7 w-7 p-0 disabled:opacity-30">
                    ▲
                  </button>
                  <button type="button" aria-label={`Move ${l.label} later`} disabled={i === ordered.length - 1 || busy} onClick={() => move(l.id, 1)} className="btn-ghost h-7 w-7 p-0 disabled:opacity-30">
                    ▼
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {selected && (
          <LocusDetails
            key={selected.id}
            room={room}
            locus={selected}
            index={selectedIndex}
            cards={selectedCards}
            busy={busy}
            onPatch={(patch, immediate) => (immediate ? commit(selected, patch) : commitSoon(selected, patch))}
            onDelete={() =>
              run(async () => {
                await actions.deleteLocus(selected.id);
                setSelectedId(null);
              })
            }
            onCreateCard={(front, back, options) => run(() => actions.createCard({ locus_id: selected.id, front, back, options }))}
            onUpdateCard={(id, front, back, options) => run(() => actions.updateCard(id, { front, back, options }))}
            onDeleteCard={(id) => run(() => actions.deleteCard(id))}
          />
        )}
      </aside>
    </div>
  );
}

function LocusDetails({
  room,
  locus,
  index,
  cards,
  busy,
  onPatch,
  onDelete,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
}: {
  room: Room;
  locus: Locus;
  index: number;
  cards: Card[];
  busy: boolean;
  onPatch: (patch: Partial<Locus>, immediate?: boolean) => void;
  onDelete: () => void;
  onCreateCard: (front: string, back: string, options?: string[]) => Promise<void>;
  onUpdateCard: (id: string, front: string, back: string, options?: string[]) => Promise<void>;
  onDeleteCard: (id: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(locus.label);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [options, setOptions] = useState("");
  const [editing, setEditing] = useState<{ id: string; front: string; back: string; options: string } | null>(null);
  const wall = locus.wall ?? "north";
  const len = wallLength(wall, room);

  return (
    <section className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{index + 1}</span>
        <input
          aria-label="Locus label"
          className="input-base flex-1"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== locus.label && onPatch({ label }, true)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="col-span-2 flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Wall</span>
          <select className="input-base w-36" value={wall} onChange={(e) => onPatch({ wall: e.target.value as WallFace }, true)}>
            {(Object.keys(WALL_NAMES) as WallFace[]).map((w) => (
              <option key={w} value={w}>
                {WALL_NAMES[w]}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2">
          <span className="flex justify-between text-muted-foreground">
            Along wall <span className="tabular-nums text-foreground">{((locus.wall_offset ?? 0.5) * len).toFixed(1)} m</span>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={locus.wall_offset ?? 0.5} onChange={(e) => onPatch({ wall_offset: Number(e.target.value) })} className="w-full select-none accent-[var(--color-primary)]" />
        </label>
        <label className="col-span-2">
          <span className="flex justify-between text-muted-foreground">
            Height <span className="tabular-nums text-foreground">{(locus.height ?? 1.5).toFixed(2)} m</span>
          </span>
          <input type="range" min={0.3} max={Math.max(0.3, room.height - 0.2)} step={0.05} value={locus.height ?? 1.5} onChange={(e) => onPatch({ height: Number(e.target.value) })} className="w-full select-none accent-[var(--color-primary)]" />
        </label>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Flashcards</h4>
        {cards.length === 0 && <p className="text-xs text-muted-foreground">Attach what you want to remember at this spot.</p>}
        {cards.map((c) =>
          editing?.id === c.id ? (
            <div key={c.id} className="space-y-1 rounded-xl border border-border p-2">
              <input aria-label="Card front" className="input-base" value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
              <textarea aria-label="Card back" className="input-base min-h-16" value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
              <input aria-label="Card wrong answers" className="input-base" placeholder="Wrong answers, comma-separated, up to 3" value={editing.options} onChange={(e) => setEditing({ ...editing, options: e.target.value })} />
              <div className="flex gap-2">
                <button type="button" className="btn-primary px-3 py-1 text-sm" disabled={busy || !editing.front.trim()} onClick={() => onUpdateCard(c.id, editing.front, editing.back, splitOptions(editing.options)).then(() => setEditing(null))}>
                  Save
                </button>
                <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="group rounded-xl border border-border bg-muted p-2 text-sm">
              <p className="font-medium">{cardFront(c)}</p>
              <p className="text-muted-foreground">{cardBack(c)}</p>
              <div className="mt-1 flex gap-3 text-xs">
                <button type="button" className="text-link hover:underline" onClick={() => setEditing({ id: c.id, front: cardFront(c), back: cardBack(c), options: cardOptionsText(c) })}>
                  Edit
                </button>
                <button type="button" className="text-destructive hover:underline" onClick={() => onDeleteCard(c.id)}>
                  Delete
                </button>
              </div>
            </div>
          )
        )}
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!front.trim()) return;
            void onCreateCard(front.trim(), back.trim(), splitOptions(options)).then(() => {
              setFront("");
              setBack("");
              setOptions("");
            });
          }}
        >
          <input aria-label="New card front" className="input-base" placeholder="Front (prompt)" value={front} onChange={(e) => setFront(e.target.value)} />
          <textarea aria-label="New card back" className="input-base min-h-16" placeholder="Back (answer)" value={back} onChange={(e) => setBack(e.target.value)} />
          <input aria-label="New card wrong answers" className="input-base" placeholder="Wrong answers, comma-separated, up to 3 (optional)" value={options} onChange={(e) => setOptions(e.target.value)} />
          <button type="submit" className="btn-primary w-full py-1.5 text-sm" disabled={busy || !front.trim()}>
            Add card
          </button>
        </form>
      </div>
      <button type="button" className="btn-danger w-full py-1.5 text-sm" disabled={busy} onClick={onDelete}>
        Delete locus
      </button>
    </section>
  );
}

interface QuickCard {
  locusId: string;
  label: string;
  front: string;
  back: string;
}

/**
 * Bottom-of-canvas card form: Enter in the prompt jumps to the answer, Enter
 * in the answer saves and clears for the next card, Esc closes.
 */
function QuickCardForm({
  quick,
  count,
  number,
  onChange,
  onRename,
  onSave,
  onClose,
}: {
  quick: QuickCard;
  count: number;
  number: number;
  onChange: (q: QuickCard) => void;
  onRename: (label: string) => void;
  onSave: (front: string, back: string) => Promise<void>;
  onClose: () => void;
}) {
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    frontRef.current?.focus();
  }, []);
  const save = async () => {
    const front = quick.front.trim();
    if (!front) return frontRef.current?.focus();
    onChange({ ...quick, front: "", back: "" });
    frontRef.current?.focus();
    await onSave(front, quick.back.trim());
  };
  const done = async () => {
    if (quick.front.trim()) await onSave(quick.front.trim(), quick.back.trim());
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Closing keeps a typed prompt rather than silently dropping it.
      e.preventDefault();
      e.stopPropagation();
      void done();
    }
  };
  return (
    <div
      role="dialog"
      aria-label="Add flashcards to this locus"
      className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur"
      onKeyDown={onKey}
    >
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{number}</span>
        <input
          aria-label="Locus label"
          className="input-base !w-44 !py-1 text-sm"
          value={quick.label}
          onChange={(e) => onChange({ ...quick, label: e.target.value })}
          onBlur={() => onRename(quick.label)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRename(quick.label);
              frontRef.current?.focus();
            }
          }}
        />
        <span className="text-xs text-muted-foreground">
          {count} card{count === 1 ? "" : "s"} here · Enter saves and starts the next card
        </span>
        <button type="button" onClick={() => void done()} className="btn-ghost ml-auto !px-2 !py-1 text-xs">
          Done (Esc)
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={frontRef}
          aria-label="Card prompt"
          placeholder="Prompt (front)"
          className="input-base min-w-40 flex-1 !py-1.5 text-sm"
          value={quick.front}
          onChange={(e) => onChange({ ...quick, front: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (quick.front.trim()) backRef.current?.focus();
            }
          }}
        />
        <input
          ref={backRef}
          aria-label="Card answer"
          placeholder="Answer (back)"
          className="input-base min-w-40 flex-1 !py-1.5 text-sm"
          value={quick.back}
          onChange={(e) => onChange({ ...quick, back: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        <button type="button" onClick={() => void save()} disabled={!quick.front.trim()} className="btn-primary !px-3 !py-1.5 text-sm">
          Add card
        </button>
      </div>
    </div>
  );
}
