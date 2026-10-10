"use client";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSearchParam } from "@/hooks/useSearchParam";
import type { Room } from "@/types/database";
import PalaceWalk from "@/components/walk/PalaceWalk";

// Walk mode starting in one room (?from=<roomId> = arrived through that door,
// ?tour=1 = start this room's tour). The whole palace is walkable from here:
// see components/walk/PalaceWalk.
export default function WalkPage() {
  const params = useParams<{ roomId: string }>();
  // Walking on updates the address bar to the room you're in; the walk itself
  // was set up for the room you arrived at.
  const [roomId] = useState(params.roomId);
  const { data: room, error } = useFetch<Room>(roomId ? `/api/rooms/${roomId}` : null);
  const fromId = useSearchParam("from");
  const tour = useSearchParam("tour") === "1";
  const urlFor = useCallback((id: string) => `/walk/${id}`, []);

  if (!roomId) return <p className="p-6">Missing room id.</p>;
  if (error) return <p className="p-6 text-destructive">Could not enter this room ({error}).</p>;
  if (!room) return <p className="p-6 text-muted-foreground">Entering the palace...</p>;
  return <PalaceWalk palaceId={room.palace_id} initialRoomId={roomId} fromRoomId={fromId} tour={tour} urlFor={urlFor} />;
}
