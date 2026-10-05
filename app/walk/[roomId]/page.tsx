"use client";
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSearchParam } from "@/hooks/useSearchParam";
import type { Card, Locus, Opening, Room } from "@/types/database";
import { returnDoor, spawnAtDoor } from "@/lib/scene3d";
import WalkView from "@/components/scene3d/WalkView";

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

  // Where we came from (?from=<roomId>) decides the spawn door.
  const fromId = useSearchParam("from");
  const tourParam = useSearchParam("tour") === "1";

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
      autoTour={tourParam}
      className="h-[calc(100dvh-3.5rem)]"
      actions={
        <>
          {room.palace_id && (
            <Link href={`/palaces/${room.palace_id}`} className="btn-outline bg-card">
              {"\u2190"} Palace
            </Link>
          )}
          <Link href={`/rooms/${room.id}`} className="btn-outline bg-card">
            Edit room
          </Link>
        </>
      }
    />
  );
}
