"use client";
import { useParams } from "next/navigation";
import StudySession from "@/components/StudySession";

export default function StudyPage() {
  const { roomId } = useParams<{ roomId: string }>();
  if (!roomId) return <p className="p-6">This study link is missing a room id.</p>;
  return (
    <StudySession
      endpoint={`/api/reviews?room=${roomId}`}
      backHref={`/rooms/${roomId}`}
      backLabel="Back to room editor"
      sessionMeta={{ room_id: roomId }}
    />
  );
}