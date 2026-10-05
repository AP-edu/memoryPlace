"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Level, Opening, Palace, Room } from "@/types/database";
import { Room3DPreview } from "@/components/palace/Room3DPreview";
import { GridEditor } from "@/components/palace-editor/GridEditor";
import { httpBackend } from "@/components/palace-editor/backend";

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
      </div>
      {palaceErr && <p className="mt-2 text-sm text-destructive">{palaceErr}</p>}

      <h1 className="mb-1 mt-6 text-3xl font-semibold">{palace?.title ?? "Palace"} — Blueprint</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Draw rooms on the grid (metres, north up), stack levels, and place doors on shared walls. Open a room to place loci and
        cards.
      </p>

      {ready ? (
        <GridEditor
          palace={palace}
          initialLevels={levels}
          initialRooms={rooms}
          initialOpenings={openings}
          backend={httpBackend}
          onRoomsChange={onRoomsChange}
          onPreviewRoom={setPreviewRoomId}
        />
      ) : (
        <p className="text-muted-foreground">Loading blueprint…</p>
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
            <Link href={`/rooms/${previewRoom.id}`} className="btn-ghost">
              Edit room
            </Link>
          </div>
        </div>
      )}

      {liveRooms.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-semibold">Rooms</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {liveRooms
              .filter((r) => !r.id.startsWith("tmp-"))
              .map((r) => (
                <div key={r.id} className="card-base p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.width} × {r.depth} × {r.height} m
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{levelName(r)}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <Link href={`/rooms/${r.id}`} className="btn-outline !px-3 !py-1.5">
                      Edit room
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
              ))}
          </div>
        </>
      )}
    </div>
  );
}
