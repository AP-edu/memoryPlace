"use client";
import { useCallback } from "react";
import { useParams } from "next/navigation";
import { useSearchParam } from "@/hooks/useSearchParam";
import PalaceWalk from "@/components/walk/PalaceWalk";

// Walk a whole palace as one building (?room= start room, ?tour=1 guided tour
// of due cards, room to room). Shares PalaceWalk with /walk/[roomId].
export default function PalaceWalkPage() {
  const { palaceId } = useParams<{ palaceId: string }>();
  const roomParam = useSearchParam("room");
  const fromParam = useSearchParam("from");
  const tour = useSearchParam("tour") === "1";
  const urlFor = useCallback(
    (roomId: string) => `/walk/palace/${palaceId}?room=${roomId}${tour ? "&tour=1" : ""}`,
    [palaceId, tour]
  );
  if (!palaceId) return <p className="p-6">Missing palace id.</p>;
  return <PalaceWalk palaceId={palaceId} initialRoomId={roomParam} fromRoomId={fromParam} tour={tour} urlFor={urlFor} />;
}
