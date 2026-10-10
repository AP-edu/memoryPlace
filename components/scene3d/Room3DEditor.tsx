"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Card, Locus, Opening, Room, WallFace } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";
import { wallLength } from "@/lib/geometry";
import { anchorFromPoint, anchorInOpening, distributeOnWall, reorderPositions, toScene, tourOrder, type WallAnchor } from "@/lib/scene3d";
import { LocusMarkers, RoomShell, SceneLights, type WallPointerEvent } from "./RoomShell";
import { SceneGate } from "./SceneBoundary";
import { useSceneColors } from "./useSceneColors";
import { SceneSky } from "./SceneSky";
import type { LociActions } from "./actions";
import ImportFromDeck from "@/components/decks/ImportFromDeck";
import SendToDeck from "@/components/decks/SendToDeck";
import MiniMap from "./MiniMap";
import type { Blueprint } from "@/lib/blueprint";

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
  onDeckChanged,
  initialTool,
  levelPlan = null,
  onGoRoom,
  className = "",
  height = 520,
}: {
  room: Room;
  loci: Locus[];
  openings: Opening[];
  cards: Card[];
  actions: LociActions;
  /** Called after a deck import / link change so the page can refetch cards. */
  onDeckChanged?: () => void;
  /** Deep links (/rooms/[id]?tool=place) open straight into place mode. */
  initialTool?: Tool;
  /** Whole-level plan for the sidebar map (click a locus to select it, a room to open it). */
  levelPlan?: Blueprint | null;
  onGoRoom?: (roomId: string) => void;
  className?: string;
  height?: number;
}) {
  const colors = useSceneColors();
  const [tool, setTool] = useState<Tool>(initialTool ?? (loci.length === 0 ? "place" : "select"));
  // A bulk change (e.g. a deck import adding many loci at once) leaves place
  // mode, so the next stray wall click doesn't add yet another locus.
  const [prevLociCount, setPrevLociCount] = useState(loci.length);
  if (loci.length !== prevLociCount) {
    setPrevLociCount(loci.length);
    if (loci.length - prevLociCount > 1 && tool === "place") setTool("select");
  }
  /** Transient message ("that's a doorway") and the one-step undo snackbar. */
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const lastActionRef = useRef(lastAction);
  useEffect(() => {
    lastActionRef.current = lastAction;
  }, [lastAction]);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);
  const offerUndo = useCallback((message: string, undo: () => Promise<void>) => {
    setLastAction({ message, undo });
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = setTimeout(() => setLastAction(null), 12000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (actionTimer.current) clearTimeout(actionTimer.current);
    },
    []
  );
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
    if (anchorInOpening(a, room, openings)) {
      flash("That's a doorway. Click a solid stretch of wall instead.");
      return;
    }
    const position = loci.reduce((m, l) => Math.max(m, l.position), -1) + 1;
    const leftover = quick;
    void run(async () => {
      // Placing the next locus keeps whatever was typed for the previous one,
      // and says so (it used to attach silently).
      if (leftover && leftover.front.trim()) {
        await actions.createCard({
          locus_id: leftover.locusId,
          front: leftover.front.trim(),
          back: leftover.back.trim(),
          options: splitOptions(leftover.options),
        });
        const n = ordered.findIndex((l) => l.id === leftover.locusId) + 1;
        flash(n > 0 ? `Saved your unsent card on locus ${n}.` : "Saved your unsent card on the previous locus.");
      }
      const created = await actions.createLocus({
        room_id: room.id,
        label: `Locus ${position + 1}`,
        wall: a.wall,
        wall_offset: a.wall_offset,
        height: a.height,
        position,
      });
      setSelectedId(created.id);
      // Stay in place mode and open the inline card form straight away.
      setQuick({ locusId: created.id, label: created.label, front: "", back: "", options: "" });
      offerUndo(`Placed locus ${loci.length + 1}`, async () => {
        await actions.deleteLocus(created.id);
        setSelectedId((cur) => (cur === created.id ? null : cur));
        setQuick((q) => (q?.locusId === created.id ? null : q));
      });
    });
  }

  function onWallMove(e: WallPointerEvent) {
    const a = anchorOf(e);
    if (dragging) {
      e.event.stopPropagation();
      // Plain drag slides along the wall at the marker's own height; hold
      // Shift to move it up and down as well (stops vertical wobble).
      const base = loci.find((l) => l.id === dragging.id);
      const shift = !!(e.event.nativeEvent as MouseEvent).shiftKey;
      const next = shift || !base ? a : { ...a, height: base.height ?? a.height };
      if (anchorInOpening(next, room, openings)) return; // keep the last valid spot
      setDragging({ id: dragging.id, anchor: next });
    } else if (tool === "place") {
      setHover(anchorInOpening(a, room, openings) ? null : a);
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
      if (d?.anchor && locus) {
        const before = { wall: locus.wall ?? "north", wall_offset: locus.wall_offset ?? 0.5, height: locus.height ?? 1.5 };
        commit(locus, d.anchor);
        offerUndo(`Moved ${locus.label || "locus"}`, () => actions.updateLocus(locus.id, before));
      }
    };
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, loci, commit, actions, offerUndo]);

  // Keyboard nudges on the selected locus (←/→ along wall, ↑/↓ height).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      // Ctrl/Cmd+Z undoes the last placement or move.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && lastActionRef.current) {
        e.preventDefault();
        const a = lastActionRef.current;
        setLastAction(null);
        void run(a.undo);
        return;
      }
      // Tool keys: P = place loci, V = select / drag, Esc leaves place mode.
      if (plain && (e.key === "p" || e.key === "P")) return setTool("place");
      if (plain && (e.key === "v" || e.key === "V")) return setTool("select");
      if (e.key === "Escape") {
        if (tool === "place") setTool("select");
        setSelectedId(null);
        return;
      }
      if (!selected) return;
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
      if (patch) {
        e.preventDefault();
        commitSoon(selected, patch);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, room, commitSoon, tool, run]);

  function move(id: string, dir: -1 | 1) {
    const updates = reorderPositions(loci, id, dir);
    if (updates.length) void run(() => actions.setPositions(updates));
  }

  function moveCard(locusId: string, id: string, dir: -1 | 1) {
    // Normalise missing positions to the end (creation order) so legacy rows reorder sanely.
    const list = cards
      .filter((c) => c.locus_id === locusId)
      .map((c, i) => ({ ...c, position: typeof c.position === "number" ? c.position : 1000 + i }));
    const updates = reorderPositions(list, id, dir);
    if (updates.length) void run(() => Promise.all(updates.map((u) => actions.updateCard(u.id, { position: u.position }))));
  }

  // Live "where am I" readout while hovering in place mode or dragging a marker.
  const readout = dragging?.anchor ?? (tool === "place" && !dragging ? hover : null);
  const selectedWall = selected?.wall ?? "north";
  const wallLoci = selected ? ordered.filter((l) => (l.wall ?? "north") === selectedWall) : [];

  function spreadEvenly() {
    const updates = distributeOnWall(wallLoci, selectedWall, room, openings);
    if (updates.length === 0) return flash("Those loci are already evenly spaced.");
    const before = updates.map((u) => ({ id: u.id, wall_offset: loci.find((l) => l.id === u.id)?.wall_offset ?? 0.5 }));
    void run(async () => {
      await Promise.all(updates.map((u) => actions.updateLocus(u.id, { wall_offset: u.wall_offset })));
      offerUndo(`Spread ${wallLoci.length} loci evenly`, async () => {
        await Promise.all(before.map((b) => actions.updateLocus(b.id, { wall_offset: b.wall_offset })));
      });
    });
  }

  const camDist = Math.max(room.width, room.depth) * 1.15 + 3;
  const target = toScene({ x: room.width / 2, y: room.height * 0.35, z: room.depth / 2 });
  const palaceHref = `/palaces/${room.palace_id}`;

  return (
    <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] ${className}`}>
      <div className="relative select-none overflow-hidden rounded-2xl border border-border bg-card" style={{ height }}>
        <SceneGate title="3D editor couldn't start" backHref={palaceHref} backLabel="Back to palace blueprint">
          <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
          camera={{ position: toScene({ x: room.width / 2 + camDist * 0.35, y: camDist * 0.75, z: room.depth / 2 - camDist * 0.8 }), fov: 50 }}
          onPointerMissed={() => tool === "select" && !dragging && setSelectedId(null)}
          onPointerLeave={() => setHover(null)}
          style={{ cursor: dragging ? "grabbing" : tool === "place" ? "crosshair" : "default", touchAction: "none" }}
        >
          <color attach="background" args={[colors.horizon]} />
          <fog attach="fog" args={[colors.fog, camDist * 1.5, camDist * 4]} />
          <SceneSky colors={colors} radius={400} />
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
        </SceneGate>
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
                {t === "select" ? "Select / drag (V)" : "+ Locus & cards (P)"}
              </button>
            ))}
          </div>
          {tool === "place" ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-accent/90 px-2.5 py-1 text-xs font-medium text-accent-foreground shadow-sm">
              Placing · click a wall
              <button type="button" onClick={() => setTool("select")} className="rounded bg-card/80 px-1.5 py-0.5 text-foreground hover:bg-card">
                Done (Esc)
              </button>
            </div>
          ) : (
            <p className="pointer-events-none rounded-lg bg-card/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
              Drag a marker along the walls (Shift = also up/down) · ←/→ slide · ↑/↓ height · Ctrl+Z undo
            </p>
          )}
        </div>
        {readout && (
          <div className="pointer-events-none absolute right-3 top-14 rounded-lg bg-card/90 px-2.5 py-1 text-xs tabular-nums text-foreground shadow-sm backdrop-blur">
            {WALL_NAMES[readout.wall]} wall · {(readout.wall_offset * wallLength(readout.wall, room)).toFixed(1)} m along ·{" "}
            {readout.height.toFixed(2)} m high
          </div>
        )}
        {(notice || lastAction) && (
          <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex flex-col items-center gap-2 px-3">
            {notice && (
              <p role="status" className="rounded-lg border border-accent/50 bg-card/95 px-3 py-1.5 text-sm shadow-lg">
                {notice}
              </p>
            )}
            {lastAction && (
              // Only Undo takes clicks: the message must not block grabbing a marker behind it.
              <p className="flex items-center gap-3 rounded-lg border border-border bg-card/95 px-3 py-1.5 text-sm shadow-lg">
                {lastAction.message}
                <button
                  type="button"
                  className="pointer-events-auto font-semibold text-link hover:underline"
                  onClick={() => {
                    const a = lastAction;
                    setLastAction(null);
                    void run(a.undo);
                  }}
                >
                  Undo
                </button>
              </p>
            )}
          </div>
        )}
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
            onSave={(front, back, options) =>
              run(() => actions.createCard({ locus_id: quick.locusId, front, back, options: splitOptions(options) }))
            }
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
        {levelPlan && (
          <MiniMap
            plan={levelPlan}
            currentRoomId={room.id}
            activeLocusN={selectedIndex >= 0 ? selectedIndex + 1 : null}
            onGoLocus={(n) => setSelectedId(ordered[n - 1]?.id ?? null)}
            onGoRoom={onGoRoom}
            className="self-start"
          />
        )}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Study path ({ordered.length})</h3>
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No loci yet. Press <kbd className="rounded bg-muted px-1">P</kbd> (or “+ Locus &amp; cards”) and click a wall — or use
              “Import deck” above to turn a whole deck into loci, one per card.
            </p>
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
          {selected && wallLoci.length > 1 && (
            <button type="button" onClick={spreadEvenly} disabled={busy} className="btn-outline mt-3 w-full !py-1.5 text-xs">
              Spread {wallLoci.length} loci evenly on the {selectedWall} wall
            </button>
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
            onDelete={() => {
              const n = selectedCards.length;
              const msg = `Delete "${selected.label || "this locus"}"${n > 0 ? ` and its ${n} card${n === 1 ? "" : "s"}` : ""}? This can't be undone.`;
              if (!window.confirm(msg)) return;
              void run(async () => {
                await actions.deleteLocus(selected.id);
                setSelectedId(null);
              });
            }}
            onCreateCard={(front, back, options) => run(() => actions.createCard({ locus_id: selected.id, front, back, options }))}
            onUpdateCard={(id, front, back, options) => run(() => actions.updateCard(id, { front, back, options }))}
            onMoveCard={(id, dir) => moveCard(selected.id, id, dir)}
            onDeleteCard={async (id) => {
              if (!window.confirm("Delete this card? This can't be undone.")) return;
              await run(() => actions.deleteCard(id));
            }}
            onDeckChanged={onDeckChanged}
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
  onMoveCard,
  onDeleteCard,
  onDeckChanged,
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
  onMoveCard: (id: string, dir: -1 | 1) => void;
  onDeleteCard: (id: string) => Promise<void>;
  onDeckChanged?: () => void;
}) {
  const [deckPanel, setDeckPanel] = useState<"import" | "send" | null>(null);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [label, setLabel] = useState(locus.label);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [options, setOptions] = useState("");
  const [editing, setEditing] = useState<{ id: string; front: string; back: string; options: string } | null>(null);
  const wall = locus.wall ?? "north";
  const len = wallLength(wall, room);

  async function unlinkCard(cardId: string) {
    const res = await fetch(`/api/links?card_id=${cardId}`, { method: "DELETE" });
    setLinkMsg(res.ok ? "Unlinked." : "Unlink failed.");
    if (res.ok) onDeckChanged?.();
  }
  async function pushCard(card: Card) {
    if (!card.source_flashcard_id) return;
    const res = await fetch("/api/links", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashcard_id: card.source_flashcard_id, card_id: card.id, direction: "to-flashcard" }),
    });
    setLinkMsg(res.ok ? "Pushed to the deck card." : ((await res.json().catch(() => ({}))).error ?? "Push failed."));
  }

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
        {cards.map((c, ci) =>
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
              <div className="flex items-start gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-highlight">
                  {ci + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{cardFront(c)}</p>
                  <p className="text-muted-foreground">{cardBack(c)}</p>
                </div>
              </div>
              <div className="mt-1 flex gap-3 text-xs">
                <button type="button" className="text-link hover:underline" onClick={() => setEditing({ id: c.id, front: cardFront(c), back: cardBack(c), options: cardOptionsText(c) })}>
                  Edit
                </button>
                <button type="button" className="hover:underline disabled:opacity-40" disabled={ci === 0} onClick={() => onMoveCard(c.id, -1)} aria-label="Move card earlier">
                  {"\u2191"}
                </button>
                <button type="button" className="hover:underline disabled:opacity-40" disabled={ci === cards.length - 1} onClick={() => onMoveCard(c.id, 1)} aria-label="Move card later">
                  {"\u2193"}
                </button>
                <button type="button" className="text-destructive hover:underline" onClick={() => onDeleteCard(c.id)}>
                  Delete
                </button>
              </div>
              {c.source_flashcard_id && (
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full border border-success/50 px-2 py-0.5 text-success">↔ Linked to deck</span>
                  <button type="button" className="hover:underline" onClick={() => pushCard(c)}>
                    Push to deck
                  </button>
                  <button type="button" className="hover:underline" onClick={() => unlinkCard(c.id)}>
                    Unlink
                  </button>
                </div>
              )}
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
      <div className="space-y-2">
        <div className="flex gap-2 text-xs">
          <button type="button" className="btn-outline !px-2 !py-1" onClick={() => setDeckPanel(deckPanel === "import" ? null : "import")}>
            Import from deck
          </button>
          {cards.length > 0 && (
            <button type="button" className="btn-outline !px-2 !py-1" onClick={() => setDeckPanel(deckPanel === "send" ? null : "send")}>
              Send to deck
            </button>
          )}
        </div>
        {linkMsg && <p className="text-xs text-muted-foreground">{linkMsg}</p>}
        {deckPanel === "import" && (
          <ImportFromDeck roomId={room.id} locusId={locus.id} onDone={() => onDeckChanged?.()} onClose={() => setDeckPanel(null)} />
        )}
        {deckPanel === "send" && (
          <SendToDeck
            source={{ locus_id: locus.id }}
            defaultTitle={locus.label || room.title}
            label="Send this locus's cards to a deck"
            onClose={() => {
              setDeckPanel(null);
              onDeckChanged?.();
            }}
          />
        )}
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
  /** Wrong answers, comma-separated (up to 3); blank = auto-derive from sibling cards. */
  options: string;
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
  onSave: (front: string, back: string, options: string) => Promise<void>;
  onClose: () => void;
}) {
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    frontRef.current?.focus();
  }, []);
  const save = async () => {
    const front = quick.front.trim();
    if (!front) return frontRef.current?.focus();
    onChange({ ...quick, front: "", back: "", options: "" });
    frontRef.current?.focus();
    await onSave(front, quick.back.trim(), quick.options);
  };
  const done = async () => {
    if (quick.front.trim()) await onSave(quick.front.trim(), quick.back.trim(), quick.options);
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
        <input
          ref={optionsRef}
          aria-label="Wrong answers, comma-separated"
          placeholder="Wrong answers, comma-separated (optional)"
          className="input-base min-w-40 flex-1 !py-1.5 text-sm"
          value={quick.options}
          onChange={(e) => onChange({ ...quick, options: e.target.value })}
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
