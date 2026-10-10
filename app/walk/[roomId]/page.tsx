"use client";
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSearchParam } from "@/hooks/useSearchParam";
import { useLevelPlan } from "@/hooks/useLevelPlan";
import type { Card, Locus, Opening, Room } from "@/types/database";
import { returnDoor, spawnAtDoor } from "@/lib/scene3d";
import { sortPlayQueue, type QueueItem } from "@/lib/srs";
import WalkView from "@/components/scene3d/WalkView";
import type { SessionAnswer } from "@/lib/reviewTypes";

// First-person walk mode + guided tour. Rendering lives in
// components/scene3d/WalkView (shared with /dev/room-3d).

export default function WalkPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { data: room, loading: loadingRoom, error: roomError } = useFetch<Room>(roomId ? `/api/rooms/${roomId}` : null);
  const { data: loci, loading: loadingLoci } = useFetch<Locus[]>(roomId ? `/api/loci?room=${roomId}` : null);
  const { data: openings, loading: loadingOpenings } = useFetch<Opening[]>(roomId ? `/api/openings?room=${roomId}` : null);
  const { data: cards } = useFetch<Card[]>(roomId ? `/api/cards?room=${roomId}` : null);
  const { data: siblings } = useFetch<Room[]>(room?.palace_id ? `/api/rooms?palace=${room.palace_id}` : null);
  // Due-first tour order, shared with the 2D study session (lib/srs.ts).
  // Absent (or failed) reviews data falls back to canonical walk order.
  const { data: reviewQueue, loading: reviewLoading } = useFetch<{ items: QueueItem[]; now: number }>(
    roomId ? `/api/reviews?room=${roomId}` : null
  );
  // undefined = still loading (the tour waits), null = settled without an order.
  const cardOrder = useMemo(
    () =>
      reviewQueue ? sortPlayQueue(reviewQueue.items, "due", reviewQueue.now).map((i) => i.id) : reviewLoading ? undefined : null,
    [reviewQueue, reviewLoading]
  );

  // Where we came from (?from=<roomId>) decides the spawn door.
  const fromId = useSearchParam("from");
  const tourParam = useSearchParam("tour") === "1";

  const levelPlan = useLevelPlan(room?.palace_id, room?.id);

  const roomTitles = useMemo(() => Object.fromEntries((siblings ?? []).map((r) => [r.id, r.title])), [siblings]);
  const spawn = useMemo(() => {
    if (!room || !openings || !fromId) return null;
    const door = returnDoor(openings, room.id, fromId);
    return door ? spawnAtDoor(door, room) : null;
  }, [room, openings, fromId]);

  const onExitDoor = useCallback(
    (o: Opening) => {
      if (o.target_room_id && room) router.push(`/walk/${o.target_room_id}?from=${room.id}`);
    },
    [router, room]
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

  // Persist the finished tour as a study session so /results can show the
  // per-room mastery + weak cards. Resolves to the summary href (or null).
  const onTourComplete = useCallback(
    async (answers: SessionAnswer[], got: number, total: number) => {
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
          back: `/walk/${roomId}`,
          backLabel: "Back to the walk",
        });
        return `/results?${q.toString()}`;
      } catch {
        return null;
      }
    },
    [roomId]
  );

  if (!roomId) return <p className="p-6">Missing room id.</p>;
  if (loadingRoom || loadingLoci || loadingOpenings) return <p className="p-6 text-muted-foreground">Entering the palace...</p>;
  if (room && room.id !== roomId) return <p className="p-6 text-muted-foreground">Walking through...</p>;
  if (roomError || !room) {
    return <p className="p-6 text-destructive">Could not enter this room{roomError ? ` (${roomError})` : ""}.</p>;
  }

  return (
    <WalkView
      // Remount per room, and once more if the return-door spawn resolves late.
      key={`${room.id}:${spawn ? "door" : "centre"}`}
      room={room}
      loci={loci ?? []}
      openings={openings ?? []}
      cards={cards ?? []}
      roomTitles={roomTitles}
      spawn={spawn}
      onExitDoor={onExitDoor}
      onGrade={onGrade}
      onTourComplete={onTourComplete}
      levelPlan={levelPlan}
      onGoRoom={(id) => router.push(`/walk/${id}?from=${room.id}`)}
      autoTour={tourParam}
      cardOrder={cardOrder}
      className="h-[calc(100dvh-3.5rem)]"
      actions={
        <>
          {room.palace_id && (
            <Link href={`/palaces/${room.palace_id}`} className="btn-outline bg-card max-sm:!px-3 max-sm:!py-1.5">
              {"\u2190"} Palace
            </Link>
          )}
          <Link href={`/rooms/${room.id}`} className="btn-outline bg-card max-sm:!px-3 max-sm:!py-1.5">
            Edit room
          </Link>
        </>
      }
    />
  );
}
