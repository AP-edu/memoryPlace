"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSearchParam } from "@/hooks/useSearchParam";
import { useLevelPlan } from "@/hooks/useLevelPlan";
import type { Card, Locus, Opening, Room, WallFace } from "@/types/database";
import { httpLociActions } from "@/components/scene3d/actions";
import ImportFromDeck from "@/components/decks/ImportFromDeck";
import SendToDeck from "@/components/decks/SendToDeck";
import { PageSkeleton } from "@/components/ui/Skeleton";

// three.js is client-only and heavy: load the 3D editor on demand.
// If WebGL is unavailable (e.g. hardware acceleration off) the editor shows
// a fallback card explaining the fix instead of a dead canvas.
const Room3DEditor = dynamic(() => import("@/components/scene3d/Room3DEditor"), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse rounded-2xl border border-border bg-card" />,
});

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

  const toolParam = useSearchParam("tool");
  const levelPlan = useLevelPlan(room?.palace_id, room?.id, { loci, openings });
  const [formError, setFormError] = useState<string | null>(null);
  const [deckPanel, setDeckPanel] = useState<"import" | "send" | null>(null);

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

  // Openings
  const [newOpeningWall, setNewOpeningWall] = useState<WallFace>("north");
  const [newOpeningKind, setNewOpeningKind] = useState<"door" | "archway">("door");
  const [newOpeningOffset, setNewOpeningOffset] = useState(0.5);

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
  if (!room || loadingLoci || loadingCards) return <PageSkeleton label="Loading room editor" cards={2} />;
  if (lociError || cardsError || openingsError) {
    return <p className="p-6 text-destructive">Failed to load: {lociError ?? cardsError ?? openingsError}</p>;
  }

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
          <button onClick={() => setDeckPanel(deckPanel === "import" ? null : "import")} className="btn-outline !px-3 !py-1.5">
            Import deck
          </button>
          {(cards?.length ?? 0) > 0 && (
            <button onClick={() => setDeckPanel(deckPanel === "send" ? null : "send")} className="btn-outline !px-3 !py-1.5">
              Export to deck
            </button>
          )}
          <button onClick={deleteRoom} className="btn-danger">
            Delete room
          </button>
        </div>
      </div>
      {deckPanel === "import" && (
        <div className="mt-3">
          <ImportFromDeck
            roomId={room.id}
            onDone={() => {
              refetchLoci();
              refetchCards();
            }}
            onClose={() => setDeckPanel(null)}
          />
        </div>
      )}
      {deckPanel === "send" && (
        <div className="mt-3">
          <SendToDeck
            source={{ room_id: room.id }}
            defaultTitle={room.title}
            label="Send every card in this room to a deck (spatial order)"
            onClose={() => {
              setDeckPanel(null);
              refetchCards();
            }}
          />
        </div>
      )}

      <div className="mt-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Room Editor</h1>
        <p className="text-sm text-muted-foreground">Click a wall to place a locus, drag markers, attach cards.</p>
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

      <div className="mb-4">
        <Room3DEditor
          room={room}
          loci={loci ?? []}
          openings={openings ?? []}
          cards={cards ?? []}
          actions={lociActions}
          initialTool={toolParam === "place" ? "place" : undefined}
          levelPlan={levelPlan}
          onGoRoom={(rid) => router.push(`/rooms/${rid}`)}
          onDeckChanged={() => {
            refetchLoci();
            refetchCards();
          }}
        />
      </div>

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
                <button onClick={() => toggleOpening(op)} className="text-link hover:underline">
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
    </div>
  );
}
