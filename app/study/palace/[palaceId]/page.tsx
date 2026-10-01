"use client";
import { useParams } from "next/navigation";
import StudySession from "@/components/StudySession";

export default function PalaceStudyPage() {
  const { palaceId } = useParams<{ palaceId: string }>();
  if (!palaceId) return <p className="p-6">This study link is missing a palace id.</p>;
  return (
    <StudySession
      endpoint={`/api/reviews?palace=${palaceId}`}
      backHref={`/palaces/${palaceId}`}
      backLabel="Back to palace blueprint"
      sessionMeta={{ palace_id: palaceId }}
    />
  );
}