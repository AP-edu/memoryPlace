"use client";
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSearchParam } from "@/hooks/useSearchParam";
import { useLevelPlan } from "@/hooks/useLevelPlan";
import type { Card, Locus, Opening, Room } from "@/types/database";
import { sortPlayQueue, type QueueItem } from "@/lib/srs";
import WalkView from "@/components/scene3d/WalkView";
import type { SessionAnswer } from "@/lib/reviewTypes";

// Palace-scope walk-and-answer tour (Phase D): one room at a time in
// canonical traversal order (creation order), due-first queue per room.
// No new geometry — reuses WalkView per room, remounted on room change.
export default function PalaceWalkPage() {
  const { palaceId } = useParams<{ palaceId: string }>();
  const router = useRouter();
  const roomParam = useSearchParam("room");
  const tourParam = useSearchParam("tour") === "1";

  const { data: rooms, loading: loadingRooms, error: roomsError } = useFetch<Room[]>(
    palaceId ? `/api/rooms?palace=${palaceId}` : null
  );
  const orderedRooms = useMemo(
    () => (rooms ? [...rooms].sort((a, b) => a.created_at.localeCompare(b.created_at)) : null),
    [rooms]
  );
  const currentId = useMemo(() => {
    if (!orderedRooms || orderedRooms.length === 0) return null;
    if (roomParam && orderedRooms.some((r) => r.id === roomParam)) return roomParam;
    return orderedRooms[0].id;
  }, [orderedRooms, roomParam]);
  const roomIndex = orderedRooms && currentId ? orderedRooms.findIndex((r) => r.id === currentId) : -1;

  const { data: loci } = useFetch<Locus[]>(currentId ? `/api/loci?room=${currentId}` : null);
  const { data: openings } = useFetch<Opening[]>(currentId ? `/api/openings?room=${currentId}` : null);
  const { data: cards } = useFetch<Card[]>(currentId ? `/api/cards?room=${currentId}` : null);
  const { data: reviewQueue, loading: reviewLoading } = useFetch<{ items: QueueItem[]; now: number }>(
    currentId ? `/api/reviews?room=${currentId}` : null
  );
  // undefined = still loading (the tour waits), null = settled without an order.
  const cardOrder = useMemo(
    () =>
      reviewQueue ? sortPlayQueue(reviewQueue.items, "due", reviewQueue.now).map((i) => i.id) : reviewLoading ? undefined : null,
    [reviewQueue, reviewLoading]
  );

  const roomTitles = useMemo(() => Object.fromEntries((orderedRooms ?? []).map((r) => [r.id, r.title])), [orderedRooms]);
  const levelPlan = useLevelPlan(palaceId, currentId);

  const goRoom = useCallback(
    (id: string) => {
      router.push(`/walk/palace/${palaceId}?room=${id}${tourParam ? "&tour=1" : ""}`);
    },
    [router, palaceId, tourParam]
  );

  const onExitDoor = useCallback(
    (o: Opening) => {
      if (!o.target_room_id) return;
      if (orderedRooms?.some((r) => r.id === o.target_room_id)) goRoom(o.target_room_id);
      else router.push(`/walk/${o.target_room_id}`);
    },
    [orderedRooms, goRoom, router]
  );

  const onGrade = useCallback(async (card: Card, correct: boolean) => {
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: card.id, correct }),
      });
    } catch {
      // The tour keeps going; grading is best-effort here.
    }
  }, []);

  // Each room's tour is saved as its own session (scope = that room) so the
  // summary can show mastery + weak cards for exactly what was just walked.
  const onTourComplete = useCallback(
    async (answers: SessionAnswer[], got: number, total: number) => {
      const roomId = answers[0]?.roomId;
      if (!roomId) return null;
      try {
        const res = await fetch("/api/study-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId, score: got, total, answers }),
        });
        if (!res.ok) return null;
        const saved = await res.json();
        const q = new URLSearchParams({
          session: saved.id,
          score: String(got),
          total: String(total),
          back: `/walk/palace/${palaceId}?room=${roomId}`,
          backLabel: "Back to the palace walk",
        });
        return `/results?${q.toString()}`;
      } catch {
        return null;
      }
    },
    [palaceId]
  );

  if (!palaceId) return <p className="p-6">Missing palace id.</p>;
  if (loadingRooms || !orderedRooms) return <p className="p-6 text-muted-foreground">Entering the palace...</p>;
  if (roomsError) return <p className="p-6 text-destructive">Could not load palace rooms ({roomsError}).</p>;
  if (orderedRooms.length === 0 || !currentId) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="text-lg">No rooms here yet. Draw rooms on the blueprint first.</p>
        <Link href={`/palaces/${palaceId}`} className="btn-primary mt-4">
          ← Palace blueprint
        </Link>
      </div>
    );
  }
  const room = orderedRooms[roomIndex] ?? orderedRooms[0];
  const prev = roomIndex > 0 ? orderedRooms[roomIndex - 1] : null;
  const next = roomIndex >= 0 && roomIndex < orderedRooms.length - 1 ? orderedRooms[roomIndex + 1] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Palace tour · room {roomIndex + 1} of {orderedRooms.length} · {room.title}
        </p>
        <div className="flex gap-2 text-sm">
          {prev && (
            <button onClick={() => goRoom(prev.id)} className="btn-ghost">
              ← {prev.title}
            </button>
          )}
          {next && (
            <button onClick={() => goRoom(next.id)} className="btn-outline">
              {next.title} →
            </button>
          )}
        </div>
      </div>
      <WalkView
        key={room.id}
        room={room}
        loci={loci ?? []}
        openings={openings ?? []}
        cards={cards ?? []}
        roomTitles={roomTitles}
        spawn={null}
        onExitDoor={onExitDoor}
        onGrade={onGrade}
        onTourComplete={onTourComplete}
        levelPlan={levelPlan}
        onGoRoom={goRoom}
        autoTour={tourParam}
        cardOrder={cardOrder}
        className="h-[calc(100dvh-3.5rem)]"
        actions={
          <>
            <Link href={`/palaces/${palaceId}`} className="btn-outline bg-card max-sm:!px-3 max-sm:!py-1.5">
              ← Palace
            </Link>
            <Link href={`/rooms/${room.id}`} className="btn-outline bg-card max-sm:!px-3 max-sm:!py-1.5">
              Edit room
            </Link>
          </>
        }
      />
    </div>
  );
}
