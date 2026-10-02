"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSearchParam } from "@/hooks/useSearchParam";
import type { Card, Locus, Opening, Room, WallFace } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";
import { clamp01, openingWidthM, wallPoint } from "@/lib/geometry";
import { httpLociActions } from "@/components/scene3d/actions";

// three.js is client-only and heavy: load the 3D editor on demand.
const Room3DEditor = dynamic(() => import("@/components/scene3d/Room3DEditor"), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse rounded-2xl border border-border bg-card" />,
});

const THICK = 0.5;
const SNAP_STEPS = [0, 0.25, 0.5, 0.75, 1];
const WALL_LABEL: Record<WallFace, string> = { north: "N", south: "S", east: "E", west: "W" };

function snapOffset(o: number): number {
  return Math.round(clamp01(o) * 20) / 20;
}

function wallAt(size: { width: number; depth: number }, x: number, z: number): WallFace | null {
  if (z < THICK) return "south";
  if (z > size.depth - THICK) return "north";
  if (x < THICK) return "west";
  if (x > size.width - THICK) return "east";
  return null;
}

function offsetOnWall(wall: WallFace, x: number, z: number, size: { width: number; depth: number }): number {
  if (wall === "north" || wall === "south") return x / size.width;
  return z / size.depth;
}

function openingArc(op: Opening, size: { width: number; depth: number }): string {
  const center = wallPoint(op.wall, op.wall_offset, size);
  const half = openingWidthM(op, size) / 2;
  const bulge = Math.min(half, 1.2);
  switch (op.wall) {
    case "north":
      return `M ${center.x - half} ${size.depth} Q ${center.x} ${size.depth - bulge} ${center.x + half} ${size.depth}`;
    case "south":
      return `M ${center.x - half} 0 Q ${center.x} ${bulge} ${center.x + half} 0`;
    case "east":
      return `M ${size.width} ${center.z - half} Q ${size.width - bulge} ${center.z} ${size.width} ${center.z + half}`;
    case "west":
      return `M 0 ${center.z - half} Q ${bulge} ${center.z} 0 ${center.z + half}`;
  }
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: room, refetch: refetchRoom } = useFetch<Room>(id ? `/api/rooms/${id}` : null);
  const { data: loci, loading: loadingLoci, error: lociError, refetch: refetchLoci } = useFetch<Locus[]>(
    id ? `/api/loci?room=${id}` : null
  );
  const { data: openings, error: openingsError, refetch: refetchOpenings } = useFetch<Opening[]>(
    id ? `/api/openings?room=${id}` : null
  );
  const { data: cards, loading: loadingCards, error: cardsError, refetch: refetchCards } = useFetch<Card[]>(
    id ? `/api/cards?room=${id}` : null
  );

  const [formError, setFormError] = useState<string | null>(null);

  // 2D plan vs 3D editor; both edit the same loci/cards rows via the same API.
  const viewParam = useSearchParam("view");
  const [viewChoice, setView] = useState<"2d" | "3d" | null>(null);
  const view = viewChoice ?? (viewParam === "3d" ? "3d" : "2d");
  function switchView(next: "2d" | "3d") {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "3d") url.searchParams.set("view", "3d");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }
  const lociActions = useMemo(
    () => httpLociActions((what) => (what === "loci" ? refetchLoci() : refetchCards())),
    [refetchLoci, refetchCards]
  );

  // Geometry
  const [roomTitle, setRoomTitle] = useState("");
  const [roomW, setRoomW] = useState("10");
  const [roomD, setRoomD] = useState("8");
  const [roomH, setRoomH] = useState("3");
  const seeded = useRef(false);
  useEffect(() => {
    if (room && !seeded.current) {
      seeded.current = true;
      setRoomTitle(room.title);
      setRoomW(String(room.width));
      setRoomD(String(room.depth));
      setRoomH(String(room.height));
    }
  }, [room]);

  // Locus editing/placement state
  const [mode, setMode] = useState<"idle" | "place" | "edit">("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [geoWall, setGeoWall] = useState<WallFace>("north");
  const [geoOffset, setGeoOffset] = useState(0.5);
  const [geoHeight, setGeoHeight] = useState("1.5");
  const [geoLabel, setGeoLabel] = useState("");
  const [labelFocus, setLabelFocus] = useState(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (labelFocus) labelInputRef.current?.focus();
  }, [labelFocus]);

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

  // Openings
  const [newOpeningWall, setNewOpeningWall] = useState<WallFace>("north");
  const [newOpeningKind, setNewOpeningKind] = useState<"door" | "archway">("door");
  const [newOpeningOffset, setNewOpeningOffset] = useState(0.5);

  const selected = loci?.find((l) => l.id === activeId) ?? null;
  const selectedCards = cards?.filter((c) => c.locus_id === activeId) ?? [];
  const size = room ? { width: room.width, depth: room.depth } : null;

  async function saveRoomGeometry() {
    if (!room) return;
    const width = Number(roomW);
    const depth = Number(roomD);
    const height = Number(roomH);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0 || !Number.isFinite(height) || height <= 0) {
      return setFormError("Dimensions must be positive numbers.");
    }
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: roomTitle.trim() || room.title,
        width,
        depth,
        height,
      }),
    });
    if (!res.ok) return setFormError("Failed to save room.");
    setFormError(null);
    refetchRoom();
  }

  function startPlace(wall: WallFace, offset: number) {
    if (!loci) return;
    setMode("place");
    setActiveId(null);
    setGeoWall(wall);
    setGeoOffset(offset);
    setGeoHeight((room?.height ?? 3) > 1 ? Math.min(1.5, room?.height ?? 3).toString() : "1.5");
    setGeoLabel(`Locus ${loci.length + 1}`);
    setLabelFocus(true);
  }

  function selectLocus(locus: Locus) {
    setMode("edit");
    setActiveId(locus.id);
    setGeoWall(locus.wall ?? "north");
    setGeoOffset(locus.wall_offset ?? 0);
    setGeoHeight(locus.height != null ? String(locus.height) : "1.5");
    setGeoLabel(locus.label);
  }

  function onCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!size) return;
    // North (+z) is drawn at the TOP: svg y = depth - z. Use the CTM so
    // letterboxing from preserveAspectRatio doesn't skew the hit position.
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x = pt.x;
    const z = size.depth - pt.y;
    const wall = wallAt(size, x, z);
    if (!wall) return;
    startPlace(wall, snapOffset(offsetOnWall(wall, x, z, size)));
  }

  async function placeOrSaveLocus() {
    if (!room) return;
    const height = Number(geoHeight);
    if (!Number.isFinite(height) || height <= 0) return setFormError("Height must be a positive number.");
    const label = geoLabel.trim() || "Untitled locus";

    if (mode === "edit" && selected) {
      const res = await fetch(`/api/loci/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, wall: geoWall, wall_offset: geoOffset, height }),
      });
      if (!res.ok) return setFormError("Failed to save locus.");
      setFormError(null);
      refetchLoci();
      return;
    }

    const res = await fetch("/api/loci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: room.id, label, wall: geoWall, wall_offset: geoOffset, height }),
    });
    if (!res.ok) return setFormError("Failed to place locus.");
    const created = await res.json();
    setFormError(null);
    selectLocus(created as Locus);
    refetchLoci();
  }

  async function moveLocus(idx: number, dir: -1 | 1) {
    if (!loci) return;
    const j = idx + dir;
    if (j < 0 || j >= loci.length) return;
    const a = loci[idx];
    const b = loci[j];
    await Promise.all([
      fetch(`/api/loci/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: b.position }) }),
      fetch(`/api/loci/${b.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: a.position }) }),
    ]);
    refetchLoci();
  }

  async function deleteLocus(locus: Locus) {
    if (!confirm(`Delete "${locus.label}" and its cards?`)) return;
    const res = await fetch(`/api/loci/${locus.id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete locus.");
    setFormError(null);
    setActiveId(null);
    setMode("idle");
    refetchLoci();
    refetchCards();
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return setFormError("Select a locus first.");
    if (!front.trim() || !back.trim()) return setFormError("Both card sides are required.");
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locus_id: selected.id, front, back }),
    });
    if (!res.ok) return setFormError("Failed to add card.");
    setFormError(null);
    setFront("");
    setBack("");
    refetchCards();
  }

  async function saveCard(cardId: string) {
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front: editFront, back: editBack }),
    });
    if (!res.ok) return setFormError("Failed to save card.");
    setFormError(null);
    setEditingCardId(null);
    refetchCards();
  }

  async function deleteCard(cardId: string) {
    if (!confirm("Delete this card?")) return;
    const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete card.");
    setFormError(null);
    refetchCards();
  }

  async function addOpening() {
    if (!room) return;
    const res = await fetch("/api/openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: room.id, wall: newOpeningWall, kind: newOpeningKind, wall_offset: newOpeningOffset }),
    });
    if (!res.ok) return setFormError("Failed to add opening.");
    setFormError(null);
    refetchOpenings();
  }

  async function toggleOpening(op: Opening) {
    const res = await fetch(`/api/openings/${op.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: op.kind === "door" ? "archway" : "door" }),
    });
    if (!res.ok) return setFormError("Failed to toggle opening.");
    setFormError(null);
    refetchOpenings();
  }

  async function deleteOpening(op: Opening) {
    if (!confirm(`Remove this ${op.kind} from ${op.wall}?`)) return;
    const res = await fetch(`/api/openings/${op.id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to remove opening.");
    setFormError(null);
    refetchOpenings();
  }

  async function deleteRoom() {
    if (!room) return;
    if (!confirm("Delete this room, its loci, and its cards?")) return;
    const res = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete room.");
    router.replace(`/palaces/${room.palace_id}`);
  }

  if (!id) return <p className="p-6">This room link is missing an id.</p>;
  if (!room || loadingLoci || loadingCards) return <p className="p-6 text-muted-foreground">Loading room editor...</p>;
  if (lociError || cardsError || openingsError) {
    return <p className="p-6 text-destructive">Failed to load: {lociError ?? cardsError ?? openingsError}</p>;
  }

  const wallBtns: WallFace[] = ["north", "south", "east", "west"];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {room?.palace_id && (
          <Link href={`/palaces/${room.palace_id}`} className="btn-ghost">
            {"\u2190 Back to palace blueprint"}
          </Link>
        )}
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/study/${room.id}`} className="btn-outline !px-3 !py-1.5">
            Study
          </Link>
          <Link href={`/walk/${room.id}`} className="btn-outline !px-3 !py-1.5">
            Walk
          </Link>
          <Link href={`/walk/${room.id}?tour=1`} className="btn-primary !px-3 !py-1.5">
            Tour loci
          </Link>
          <button onClick={deleteRoom} className="btn-danger">
            Delete room
          </button>
        </div>
      </div>

      <div className="mt-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Room Editor</h1>
        <div role="tablist" aria-label="Editor view" className="inline-flex rounded-xl border border-border bg-card p-1 text-sm">
          {(["2d", "3d"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => switchView(v)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "2d" ? "2D plan" : "3D room"}
            </button>
          ))}
        </div>
      </div>

      <div className="card-base mb-4 flex flex-wrap items-end gap-2 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input value={roomTitle} onChange={(e) => setRoomTitle(e.target.value)} className="input-base w-52" aria-label="Room title" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Width (w)</label>
          <input value={roomW} onChange={(e) => setRoomW(e.target.value)} type="number" min={1} step={1} className="input-base w-24" aria-label="Room width" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Depth (d)</label>
          <input value={roomD} onChange={(e) => setRoomD(e.target.value)} type="number" min={1} step={1} className="input-base w-24" aria-label="Room depth" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Height (h)</label>
          <input value={roomH} onChange={(e) => setRoomH(e.target.value)} type="number" min={0.5} step={0.1} className="input-base w-24" aria-label="Room height" />
        </div>
        <button onClick={saveRoomGeometry} className="btn-primary">
          Save room
        </button>
        <p className="ml-auto max-w-52 text-xs text-muted-foreground">
          Loci stay anchored when size changes — offsets are relative to each wall.
        </p>
      </div>

      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      {view === "3d" && (
        <div className="mb-4">
          <Room3DEditor room={room} loci={loci ?? []} openings={openings ?? []} cards={cards ?? []} actions={lociActions} />
        </div>
      )}

      {view === "2d" && size && (
        <div className="card-base mb-4 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Floor plan (top-down)</h2>
            <p className="text-xs text-muted-foreground">
              Click a wall to place a locus — it snaps to the nearest 5% along the wall.
            </p>
          </div>
          <svg
            viewBox={`0 0 ${size.width} ${size.depth}`}
            onClick={onCanvasClick}
            className="h-[460px] w-full cursor-crosshair rounded-lg border border-border bg-background/50"
            role="application"
            aria-label="Room floor plan. Click the walls to place loci."
          >
            <rect x={0} y={0} width={size.width} height={size.depth} rx={0.4} style={{ fill: "var(--card)" }} />

            {/* Plan geometry is authored in world (x, z) and flipped so north (+z) is at the top. */}
            <g transform={`matrix(1 0 0 -1 0 ${size.depth})`}>
            {/* Walls */}
            <rect x={0} y={0} width={size.width} height={THICK} style={{ fill: "var(--foreground)", opacity: 0.18 }} />
            <rect x={0} y={size.depth - THICK} width={size.width} height={THICK} style={{ fill: "var(--foreground)", opacity: 0.18 }} />
            <rect x={0} y={0} width={THICK} height={size.depth} style={{ fill: "var(--foreground)", opacity: 0.18 }} />
            <rect x={size.width - THICK} y={0} width={THICK} height={size.depth} style={{ fill: "var(--foreground)", opacity: 0.18 }} />

            {/* Opening cutouts + arcs */}
            {(openings ?? []).map((op) => {
              const center = wallPoint(op.wall, op.wall_offset, size);
              const half = openingWidthM(op, size) / 2;
              const isHorizontal = op.wall === "north" || op.wall === "south";
              const holeW = isHorizontal ? half * 2 : THICK + 0.2;
              const holeH = isHorizontal ? THICK + 0.2 : half * 2;
              const holeX = isHorizontal ? center.x - half : center.x - (THICK + 0.2) / 2;
              const holeY =
                op.wall === "north" || op.wall === "east"
                  ? isHorizontal
                    ? size.depth - (THICK + 0.2) / 2
                    : center.z - half
                  : isHorizontal
                    ? -(THICK + 0.2) / 2
                    : center.z - half;
              return (
                <g key={op.id}>
                  <rect x={holeX} y={holeY} width={holeW} height={holeH} style={{ fill: "var(--card)" }} />
                  <path
                    d={openingArc(op, size)}
                    fill="none"
                    strokeWidth={0.15}
                    stroke="var(--accent)"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Draft/active preview */}
            {mode !== "idle" && (
              <circle
                cx={wallPoint(geoWall, geoOffset, size).x}
                cy={wallPoint(geoWall, geoOffset, size).z}
                r={0.55}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={0.18}
                strokeDasharray="0.3 0.2"
              />
            )}
            </g>

            {/* Wall labels (screen space: north at top) */}
            <text x={size.width / 2} y={THICK + 0.8} textAnchor="middle" style={{ fill: "var(--muted-foreground)" }} fontSize={0.7}>
              NORTH
            </text>
            <text x={size.width / 2} y={size.depth - 0.8} textAnchor="middle" style={{ fill: "var(--muted-foreground)" }} fontSize={0.7}>
              SOUTH
            </text>
            <text x={0.9} y={size.depth / 2} textAnchor="middle" transform={`rotate(-90 0.9 ${size.depth / 2})`} style={{ fill: "var(--muted-foreground)" }} fontSize={0.7}>
              WEST
            </text>
            <text x={size.width - 0.9} y={size.depth / 2} textAnchor="middle" transform={`rotate(90 ${size.width - 0.9} ${size.depth / 2})`} style={{ fill: "var(--muted-foreground)" }} fontSize={0.7}>
              EAST
            </text>

            {/* Loci */}
            {(loci ?? []).map((locus) => {
              const p = wallPoint(locus.wall ?? "north", locus.wall_offset ?? 0, size);
              const isSel = locus.id === activeId;
              return (
                <g
                  key={locus.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectLocus(locus);
                  }}
                  transform={`translate(${p.x} ${size.depth - p.z})`}
                  className="cursor-pointer"
                  aria-label={`Locus ${locus.label}`}
                  role="button"
                >
                  <circle r={0.42} fill={isSel ? "var(--primary)" : "var(--accent)"} stroke="var(--background)" strokeWidth={0.14} />
                  <text y={0.14} textAnchor="middle" style={{ fill: "var(--accent-foreground)" }} fontSize={0.52} fontWeight={700}>
                    {locus.position + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {view === "2d" && (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-base flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-semibold">{mode === "edit" ? `Edit locus: ${selected?.label ?? ""}` : "Place a new locus"}</h2>
            <p className="text-xs text-muted-foreground">
              {mode === "edit"
                ? "Click a locus on the plan or in the list to edit it."
                : "Pick a wall, drag the position, set height, then place it."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {wallBtns.map((wall) => (
              <button
                key={wall}
                onClick={() => setGeoWall(wall)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  geoWall === wall ? "bg-primary text-primary-foreground" : "card-base hover:border-primary/60"
                }`}
              >
                {WALL_LABEL[wall]} · {wall}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Position along {geoWall} wall</span>
              <span>{Math.round(geoOffset * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={geoOffset}
              onChange={(e) => setGeoOffset(Number(e.target.value))}
              className="w-full"
              aria-label="Locus position along wall"
            />
            <div className="mt-1.5 flex gap-2">
              {SNAP_STEPS.map((s) => (
                <button
                  key={s}
                  onClick={() => setGeoOffset(s)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    Math.abs(geoOffset - s) < 0.01 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {s * 100}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input value={geoLabel} onChange={(e) => setGeoLabel(e.target.value)} ref={labelInputRef} placeholder="Locus label" className="input-base flex-1 min-w-40" aria-label="Locus label" />
            <input value={geoHeight} onChange={(e) => setGeoHeight(e.target.value)} type="number" min={0.5} step={0.1} className="input-base w-28" aria-label="Locus height (m)" />
          </div>
          <div className="flex gap-2">
            <button onClick={placeOrSaveLocus} className="btn-primary flex-1">
              {mode === "edit" ? "Save locus" : "Place locus"}
            </button>
            {mode === "edit" && selected && (
              <button onClick={() => deleteLocus(selected)} className="btn-danger">
                Delete
              </button>
            )}
            {mode === "edit" && (
              <button
                onClick={() => {
                  setMode("idle");
                  setActiveId(null);
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="card-base flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Loci — traversal order</h2>
            <span className="text-xs text-muted-foreground">{loci?.length ?? 0} placed</span>
          </div>
          {(loci?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No loci yet — click a wall on the floor plan to begin.</p>
          )}
          <div className="flex flex-col gap-1.5">
            {(loci ?? []).map((locus, i) => (
              <div
                key={locus.id}
                onClick={() => selectLocus(locus)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  locus.id === activeId ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                  {locus.position + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{locus.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {WALL_LABEL[locus.wall ?? "north"]} · {Math.round((locus.wall_offset ?? 0) * 100)}% · {locus.height ?? 1.5}m
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); moveLocus(i, -1); }} disabled={i === 0} className="rounded border border-border px-1.5 text-xs disabled:opacity-40" aria-label={`Move ${locus.label} earlier`}>
                    {"\u2191"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); moveLocus(i, 1); }} disabled={i === (loci?.length ?? 1) - 1} className="rounded border border-border px-1.5 text-xs disabled:opacity-40" aria-label={`Move ${locus.label} later`}>
                    {"\u2193"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); selectLocus(locus); }} className="rounded border border-border px-1.5 text-xs" aria-label={`Edit ${locus.label}`}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="card-base p-4">
          <h2 className="mb-3 font-semibold">Openings</h2>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={newOpeningWall} onChange={(e) => setNewOpeningWall(e.target.value as WallFace)} className="input-base w-24" aria-label="Opening wall">
              <option value="north">north</option>
              <option value="south">south</option>
              <option value="east">east</option>
              <option value="west">west</option>
            </select>
            <select value={newOpeningKind} onChange={(e) => setNewOpeningKind(e.target.value as "door" | "archway")} className="input-base w-28" aria-label="Opening kind">
              <option value="door">door</option>
              <option value="archway">archway</option>
            </select>
            <div className="flex flex-1 min-w-36 items-center gap-2 text-xs text-muted-foreground">
              <input type="range" min={0} max={1} step={0.01} value={newOpeningOffset} onChange={(e) => setNewOpeningOffset(Number(e.target.value))} className="w-full" aria-label="Opening position" />
              <span className="w-10">{Math.round(newOpeningOffset * 100)}%</span>
            </div>
            <button onClick={addOpening} className="btn-outline !px-3 !py-1.5">
              Add
            </button>
          </div>
          {(openings?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No doors or archways yet.</p>}
          <div className="flex flex-col gap-1.5">
            {(openings ?? []).map((op) => (
              <div key={op.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium">{op.kind}</span>
                <span className="text-xs text-muted-foreground">
                  {op.wall} wall · {Math.round((op.wall_offset ?? 0.5) * 100)}%
                </span>
                <div className="ml-auto flex items-center gap-2 text-xs">
                  <button onClick={() => toggleOpening(op)} className="text-primary hover:underline">
                    {op.kind === "door" ? "Make archway" : "Make door"}
                  </button>
                  <button onClick={() => deleteOpening(op)} className="text-destructive hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-base p-4">
          <h2 className="mb-3 font-semibold">Cards on {selected?.label ?? "selected locus"}</h2>
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a locus to view or attach cards.</p>
          ) : (
            <>
              <form onSubmit={addCard} className="mb-3 flex flex-col gap-2">
                <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Card front" className="input-base" />
                <div className="flex gap-2">
                  <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Card back" className="input-base flex-1" />
                  <button className="btn-primary">Add card</button>
                </div>
              </form>
              <div className="flex flex-col gap-2">
                {selectedCards.length === 0 && <p className="text-sm text-muted-foreground">No cards on this locus yet.</p>}
                {selectedCards.map((card) => (
                  <div key={card.id} className="card-base p-3">
                    {editingCardId === card.id ? (
                      <div className="flex flex-col gap-2">
                        <input value={editFront} onChange={(e) => setEditFront(e.target.value)} className="input-base" />
                        <input value={editBack} onChange={(e) => setEditBack(e.target.value)} className="input-base" />
                        <div className="flex gap-3 text-sm">
                          <button onClick={() => saveCard(card.id)} className="btn-primary !px-3 !py-1.5">
                            Save
                          </button>
                          <button onClick={() => setEditingCardId(null)} className="btn-ghost">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{cardFront(card)}</p>
                          <p className="text-sm text-muted-foreground">{cardBack(card)}</p>
                        </div>
                        <div className="flex shrink-0 gap-3 text-sm">
                          <button
                            onClick={() => {
                              setEditingCardId(card.id);
                              setEditFront(cardFront(card));
                              setEditBack(cardBack(card));
                            }}
                            className="btn-ghost"
                          >
                            Edit
                          </button>
                          <button onClick={() => deleteCard(card.id)} className="btn-danger">
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}