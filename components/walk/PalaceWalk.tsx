"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import { useRoomAccent } from "@/hooks/useRoomAccent";
import type { Card, Level, Locus, Opening, Room } from "@/types/database";
import type { ReviewItem, SessionAnswer } from "@/lib/reviewTypes";
import { isDue, sortPlayQueue } from "@/lib/srs";
import { levelPlanFor } from "@/lib/blueprint";
import { nextTourRoom, tourStartRoom, type RoomTally } from "@/lib/building";
import { returnDoor, spawnAtDoor } from "@/lib/scene3d";
import WalkView, { type NextRoom, type WalkWorld } from "@/components/scene3d/WalkView";

interface ReviewQueue {
  items: ReviewItem[];
  now: number;
}

const byCreated = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

/**
 * Walk a whole palace as one building: the palace is fetched once, the
 * current room is state (not the route), and walking through a door swaps
 * it in place while the address bar follows along. A tour (`tour`) starts
 * in the first room with cards due and continues room to room.
 */
export default function PalaceWalk({
  palaceId,
  initialRoomId,
  fromRoomId,
  tour,
  urlFor,
}: {
  palaceId: string;
  /** Room to start in (else the tour's first room, else the first room). Read once. */
  initialRoomId?: string | null;
  /** Arrived from this room: start at the door that leads back to it. */
  fromRoomId?: string | null;
  tour: boolean;
  /** Address of a room, kept in the URL as you walk so reload and share land there. */
  urlFor: (roomId: string) => string;
}) {
  const { data: rooms, error: roomsError } = useFetch<Room[]>(`/api/rooms?palace=${palaceId}`);
  const { data: openings } = useFetch<Opening[]>(`/api/openings?palace=${palaceId}`);
  const { data: loci } = useFetch<Locus[]>(`/api/loci?palace=${palaceId}`);
  const { data: levels } = useFetch<Level[]>(`/api/levels?palace=${palaceId}`);
  // Every card in the palace with its due date (lib/srs): cards per room come from here.
  const { data: queue, loading: queueLoading, error: queueError } = useFetch<ReviewQueue>(`/api/reviews?palace=${palaceId}`);

  // Cards graded during this visit no longer count as due (no refetch needed).
  const [graded, setGraded] = useState<ReadonlySet<string>>(() => new Set());
  const [toured, setToured] = useState<ReadonlySet<string>>(() => new Set());

  const order = useMemo(() => (rooms ? [...rooms].sort(byCreated).map((r) => r.id) : []), [rooms]);
  const itemsByRoom = useMemo(() => {
    const m = new Map<string, ReviewItem[]>();
    for (const i of queue?.items ?? []) {
      const list = m.get(i.roomId) ?? [];
      list.push(i);
      m.set(i.roomId, list);
    }
    return m;
  }, [queue]);
  const tally = useMemo(() => {
    const t: Record<string, RoomTally> = {};
    const now = queue?.now ?? 0;
    for (const id of order) {
      const items = itemsByRoom.get(id) ?? [];
      t[id] = {
        cards: items.length,
        due: items.filter((i) => isDue(i, now) && !graded.has(i.id)).length,
        loci: (loci ?? []).filter((l) => l.room_id === id).length,
      };
    }
    return t;
  }, [order, itemsByRoom, queue, loci, graded]);

  const ready = !!rooms && !!openings && !!loci && !!levels && !queueLoading;
  // The current room is fixed once the palace has loaded, then moves only when you do.
  const [currentId, setCurrentId] = useState<string | null>(null);
  if (ready && currentId === null && order.length > 0) {
    const wanted = initialRoomId && order.includes(initialRoomId) ? initialRoomId : null;
    setCurrentId(wanted ?? (tour ? tourStartRoom(order, tally) : order[0]));
  }
  const room = rooms?.find((r) => r.id === currentId) ?? null;

  // Fallback if the review queue failed: at least the current room's cards.
  const { data: roomCards } = useFetch<Card[]>(queueError && currentId ? `/api/cards?room=${currentId}` : null);
  const cards = useMemo<Card[]>(() => {
    if (!currentId) return [];
    if (queueError) return roomCards ?? [];
    return (itemsByRoom.get(currentId) ?? [])
      .map((i) => i.card)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at));
  }, [currentId, itemsByRoom, queueError, roomCards]);
  // Due-first order for this room (same queue maths as the 2D study session).
  // null = no order (queue failed): the tour falls back to walk order.
  const cardOrder = useMemo(
    () => (queue && currentId ? sortPlayQueue(itemsByRoom.get(currentId) ?? [], "due", queue.now).map((i) => i.id) : queueError ? null : undefined),
    [queue, currentId, itemsByRoom, queueError]
  );
  const roomLoci = useMemo(() => (loci ?? []).filter((l) => l.room_id === currentId), [loci, currentId]);
  const roomOpenings = useMemo(() => (openings ?? []).filter((o) => o.room_id === currentId), [openings, currentId]);

  const world = useMemo<WalkWorld | null>(
    () => (rooms && openings && loci ? { rooms, openings, loci, fallbackLevelId: levels?.[0]?.id ?? null, tally } : null),
    [rooms, openings, loci, levels, tally]
  );
  const levelPlan = useMemo(
    () => (rooms && loci && openings && levels && currentId ? levelPlanFor(rooms, loci, openings, levels, currentId) : null),
    [rooms, loci, openings, levels, currentId]
  );
  const roomTitles = useMemo(() => Object.fromEntries((rooms ?? []).map((r) => [r.id, r.title])), [rooms]);
  const nextRooms = useMemo(() => {
    if (!currentId || !rooms) return null;
    const pick = (id: string | null): NextRoom | null => {
      const r = id ? rooms.find((x) => x.id === id) : null;
      return r ? { id: r.id, title: r.title, due: tally[r.id]?.due ?? 0, cards: tally[r.id]?.cards ?? 0 } : null;
    };
    const done = new Set([...toured, currentId]);
    return { due: pick(nextTourRoom(order, currentId, tally, done)), any: pick(nextTourRoom(order, currentId, tally, done, true)) };
  }, [currentId, rooms, order, tally, toured]);

  // Start at the door you came through (?from=), only for the first room.
  const [spawnFrom] = useState(fromRoomId ?? null);
  const spawn = useMemo(() => {
    if (!room || !openings || !spawnFrom || room.id !== initialRoomId) return null;
    const door = returnDoor(openings, room.id, spawnFrom);
    return door ? spawnAtDoor(door, room) : null;
  }, [room, openings, spawnFrom, initialRoomId]);

  const accent = useRoomAccent(room?.background);

  const onEnterRoom = useCallback(
    (id: string) => {
      setCurrentId(id);
      // Keep the address in step (reload / share lands here) without a navigation.
      window.history.replaceState(null, "", urlFor(id));
    },
    [urlFor]
  );

  const onGrade = useCallback(async (card: Card, correct: boolean) => {
    setGraded((g) => new Set(g).add(card.id));
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
      setToured((t) => new Set(t).add(roomId));
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
          back: urlFor(roomId),
          backLabel: "Back to the walk",
        });
        return `/results?${q.toString()}`;
      } catch {
        return null;
      }
    },
    [urlFor]
  );

  if (roomsError) return <p className="p-6 text-destructive">Could not load this palace ({roomsError}).</p>;
  if (!ready) return <p className="p-6 text-muted-foreground">Entering the palace...</p>;
  if (order.length === 0 || !room) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="text-lg">No rooms here yet. Draw rooms on the blueprint first.</p>
        <Link href={`/palaces/${palaceId}`} className="btn-primary mt-4">
          {"←"} Palace blueprint
        </Link>
      </div>
    );
  }

  return (
    // The room's colour is the screen accent (buttons, links) while you're in it.
    <div style={accent}>
      <WalkView
        room={room}
        loci={roomLoci}
        openings={roomOpenings}
        cards={cards}
        roomTitles={roomTitles}
        spawn={spawn}
        world={world}
        onEnterRoom={onEnterRoom}
        nextRooms={nextRooms}
        onGrade={onGrade}
        onTourComplete={onTourComplete}
        levelPlan={levelPlan}
        intro={!spawn}
        autoTour={tour}
        cardOrder={cardOrder}
        className="h-[calc(100dvh-3.5rem)]"
        actions={
          <>
            <Link href={`/palaces/${palaceId}`} className="btn-outline bg-card max-sm:!px-3 max-sm:!py-1.5">
              {"←"} Palace
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
