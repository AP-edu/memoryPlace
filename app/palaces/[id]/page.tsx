"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Level, Locus, Opening, Palace, Room } from "@/types/database";
import { Room3DPreview } from "@/components/palace/Room3DPreview";
import { GridEditor } from "@/components/palace-editor/GridEditor";
import { httpBackend } from "@/components/palace-editor/backend";
import { PageSkeleton } from "@/components/ui/Skeleton";

// three.js is client-only and heavy: load the 3D palace tab on demand.
const Palace3DView = dynamic(() => import("@/components/palace/Palace3DView"), {
  ssr: false,
  loading: () => <div className="h-[560px] animate-pulse rounded-lg border border-border bg-card" />,
});

// Palace Overview: the 2D grid editor is the main builder (rooms, levels,
// doors). Loci and cards are still edited per room at /rooms/[id].
export default function PalacePage() {
  const { id } = useParams<{ id: string }>();
  const { data: palace, refetch: refetchPalace } = useFetch<Palace>(id ? `/api/palaces/${id}` : null);
  const { data: levels, loading: loadingLevels, error: levelsError } = useFetch<Level[]>(id ? `/api/levels?palace=${id}` : null);
  const { data: rooms, loading: loadingRooms, error: roomsError } = useFetch<Room[]>(id ? `/api/rooms?palace=${id}` : null);
  const { data: openings, loading: loadingOpenings, error: openingsError } = useFetch<Opening[]>(
    id ? `/api/openings?palace=${id}` : null
  );
  // Every locus in the palace: drawn in the 3D overview + counted on room cards.
  const { data: palaceLoci } = useFetch<Locus[]>(id ? `/api/loci?palace=${id}` : null);
  const lociByRoom = new Map<string, number>();
  for (const l of palaceLoci ?? []) lociByRoom.set(l.room_id, (lociByRoom.get(l.room_id) ?? 0) + 1);

  const [palaceTitle, setPalaceTitle] = useState("");
  const [palaceDesc, setPalaceDesc] = useState("");
  const seeded = useRef(false);
  const palaceDirty = palace ? palaceTitle !== palace.title || palaceDesc !== (palace.description ?? "") : false;
  const [palaceErr, setPalaceErr] = useState<string | null>(null);
  const [liveRooms, setLiveRooms] = useState<Room[]>([]);
  const [liveLevels, setLiveLevels] = useState<Level[]>([]);
  // Openings as edited in the grid editor, so the 3D preview shows door edits live.
  const [liveOpenings, setLiveOpenings] = useState<Opening[]>([]);
  const [previewRoomId, setPreviewRoomId] = useState<string | null>(null);
  // Canvas <-> cards selection sync: lit from the grid editor, cleared when
  // the canvas selection moves to a door or nothing.
  const [highlightedRoomId, setHighlightedRoomId] = useState<string | null>(null);
  // 2D blueprint vs 3D palace tab. The active level is owned here so both
  // tabs (and the room cards) share it.
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [editorLevelId, setEditorLevelId] = useState<string | null>(null);

  useEffect(() => {
    if (palace && !seeded.current) {
      seeded.current = true;
      setPalaceTitle(palace.title ?? "");
      setPalaceDesc(palace.description ?? "");
    }
  }, [palace]);

  const onRoomsChange = useCallback((rs: Room[], ls: Level[], os: Opening[]) => {
    setLiveRooms(rs);
    setLiveLevels(ls);
    setLiveOpenings(os);
  }, []);

  async function savePalace() {
    const res = await fetch(`/api/palaces/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: palaceTitle.trim() || palace?.title, description: palaceDesc.trim() || null }),
    });
    if (!res.ok) return setPalaceErr("Failed to save palace.");
    setPalaceErr(null);
    seeded.current = false;
    refetchPalace();
  }

  if (!id) return <p className="p-6">This palace link is missing an id.</p>;
  const loadError = levelsError ?? roomsError ?? openingsError;
  if (loadError) return <p className="p-6 text-destructive">Failed to load palace: {loadError}</p>;
  const ready = palace && levels && rooms && openings && !loadingLevels && !loadingRooms && !loadingOpenings;

  const previewRoom = liveRooms.find((r) => r.id === previewRoomId && !r.id.startsWith("tmp-")) ?? null;
  const levelName = (r: Room) => liveLevels.find((l) => l.id === r.level_id)?.name ?? liveLevels[0]?.name ?? "";
  const sortedLevels = [...liveLevels].sort((a, b) => a.idx - b.idx);
  const firstLiveLevelId = sortedLevels[0]?.id ?? null;
  const activeLevelId = editorLevelId ?? firstLiveLevelId;
  const roomsByLevel = new Map<string | null, Room[]>();
  for (const r of liveRooms.filter((x) => !x.id.startsWith("tmp-"))) {
    const key = liveLevels.some((l) => l.id === r.level_id) ? r.level_id : null;
    const list = roomsByLevel.get(key) ?? [];
    list.push(r);
    roomsByLevel.set(key, list);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <Link href="/palaces" className="btn-ghost">
        {"\u2190 Back to palaces"}
      </Link>

      <div className="mt-3 flex flex-wrap gap-2">
        <input value={palaceTitle} onChange={(e) => setPalaceTitle(e.target.value)} placeholder="Palace title" className="input-base max-w-72" aria-label="Palace title" />
        <input value={palaceDesc} onChange={(e) => setPalaceDesc(e.target.value)} placeholder="Description (optional)" className="input-base max-w-80" aria-label="Palace description" />
        <button onClick={savePalace} disabled={!palaceDirty} className="btn-primary">
          Save palace
        </button>
        <Link href={`/study/palace/${id}`} className="btn-outline">
          Study due
        </Link>
        <Link href={`/walk/palace/${id}?tour=1`} className="btn-outline">
          Walk palace
        </Link>
        <Link href={`/palaces/${id}/print`} className="btn-ghost">
          Export / Print
        </Link>
      </div>
      {palaceErr && <p className="mt-2 text-sm text-destructive">{palaceErr}</p>}

      <h1 className="mb-1 mt-6 text-3xl font-semibold">{palace?.title ?? "Palace"} — Blueprint</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Draw rooms on the grid (metres, north up), stack levels, and place doors on shared walls. Open a room to place loci and
        cards.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1" role="tablist" aria-label="Blueprint view">
        {(["2d", "3d"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-t-lg border-b-2 px-3 py-1.5 text-sm ${
              view === v ? "border-primary font-semibold text-link" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "2d" ? "2D Blueprint" : "3D Palace"}
          </button>
        ))}
        {view === "3d" && sortedLevels.length > 1 && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {[...sortedLevels].reverse().map((l) => (
              <button
                key={l.id}
                onClick={() => setEditorLevelId(l.id)}
                aria-pressed={l.id === activeLevelId}
                className={`rounded-lg px-2 py-1 text-xs ${
                  l.id === activeLevelId ? "bg-primary/10 font-semibold text-link" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.name}
              </button>
            ))}
          </>
        )}
      </div>

      {ready ? (
        view === "2d" ? (
          <GridEditor
            palace={palace}
            initialLevels={levels}
            initialRooms={rooms}
            initialOpenings={openings}
            backend={httpBackend}
            onRoomsChange={onRoomsChange}
            onPreviewRoom={setPreviewRoomId}
            selectedRoomId={highlightedRoomId}
            onSelectRoom={setHighlightedRoomId}
            activeLevelId={activeLevelId}
            onActiveLevelChange={setEditorLevelId}
          />
        ) : (
          <Palace3DView
            rooms={liveRooms}
            openings={liveOpenings}
            levelId={activeLevelId}
            fallbackLevelId={firstLiveLevelId}
            selectedId={highlightedRoomId}
            onSelect={setHighlightedRoomId}
            loci={palaceLoci ?? []}
          />
        )
      ) : (
        <PageSkeleton label="Loading blueprint" cards={2} />
      )}

      {previewRoom && (
        <div className="card-base mt-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">3D preview: {previewRoom.title}</h2>
            <button onClick={() => setPreviewRoomId(null)} className="btn-ghost">
              Close
            </button>
          </div>
          <Room3DPreview room={previewRoom} openings={liveOpenings.filter((o) => o.room_id === previewRoom.id)} />
          <div className="mt-3 flex gap-3 text-sm">
            <Link href={`/walk/${previewRoom.id}`} className="btn-primary px-3 py-1.5">
              Walk this room →
            </Link>
            <Link href={`/walk/${previewRoom.id}?tour=1`} className="btn-outline px-3 py-1.5">
              Tour the loci
            </Link>
            <Link href={`/rooms/${previewRoom.id}?tool=place`} className="btn-outline px-3 py-1.5">
              + Add loci
            </Link>
            <Link href={`/rooms/${previewRoom.id}`} className="btn-ghost">
              Edit room
            </Link>
          </div>
        </div>
      )}

      {ready && liveRooms.length === 0 && (
        <div className="card-base mt-8 p-6 text-center">
          <p className="text-lg font-semibold">Draw your first room</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pick the Room tool on the blueprint above and drag out a rectangle. Then open it to place loci on its walls.
          </p>
        </div>
      )}

      {liveRooms.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Rooms</h2>
          {[...roomsByLevel.entries()].map(([levelId, rs]) => (
            <div key={levelId ?? "none"} className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {levelId ? (liveLevels.find((l) => l.id === levelId)?.name ?? "Level") : sortedLevels.length > 0 ? "No level" : "Rooms"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rs.map((r) => {
                  const lit = r.id === highlightedRoomId;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setHighlightedRoomId(lit ? null : r.id)}
                      className={`card-base cursor-pointer p-4 transition-colors ${lit ? "border-primary ring-2 ring-primary/50" : "hover:border-primary/40"}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{r.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {r.width} × {r.depth} × {r.height} m
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {levelName(r)} · {lociByRoom.get(r.id) ?? 0} loci
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/rooms/${r.id}${(lociByRoom.get(r.id) ?? 0) === 0 ? "?tool=place" : ""}`}
                          className="btn-outline !px-3 !py-1.5"
                        >
                          {(lociByRoom.get(r.id) ?? 0) === 0 ? "+ Add loci" : "Edit room"}
                        </Link>
                        <Link href={`/walk/${r.id}?tour=1`} className="btn-primary !px-3 !py-1.5">
                          Tour
                        </Link>
                        <Link href={`/walk/${r.id}`} className="btn-ghost">
                          Walk
                        </Link>
                        <button onClick={() => setPreviewRoomId(r.id)} className="btn-ghost">
                          3D preview
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
