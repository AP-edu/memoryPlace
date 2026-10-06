"use client";
import { useMemo } from "react";
import { useFetch } from "@/hooks/useFetch";
import { levelPlanFor, type Blueprint } from "@/lib/blueprint";
import type { Level, Locus, Opening, Room } from "@/types/database";

/**
 * Top-down plan of the level a room is on (every room, door and locus), for the
 * minimap. Quietly returns null until everything has loaded, or when it can't
 * (the minimap is an aid: walking and editing never wait on it).
 *
 * `live` lets an editor feed in its own up-to-date loci/openings for the
 * current room so the map reflects edits without refetching the palace.
 */
export function useLevelPlan(
  palaceId: string | null | undefined,
  roomId: string | null | undefined,
  live?: { loci?: Locus[] | null; openings?: Opening[] | null }
): Blueprint | null {
  const { data: rooms } = useFetch<Room[]>(palaceId ? `/api/rooms?palace=${palaceId}` : null);
  const { data: loci } = useFetch<Locus[]>(palaceId ? `/api/loci?palace=${palaceId}` : null);
  const { data: openings } = useFetch<Opening[]>(palaceId ? `/api/openings?palace=${palaceId}` : null);
  const { data: levels } = useFetch<Level[]>(palaceId ? `/api/levels?palace=${palaceId}` : null);
  const liveLoci = live?.loci;
  const liveOpenings = live?.openings;
  return useMemo(() => {
    if (!rooms || !loci || !openings || !levels || !roomId) return null;
    const allLoci = liveLoci ? [...loci.filter((l) => l.room_id !== roomId), ...liveLoci] : loci;
    const allOpenings = liveOpenings ? [...openings.filter((o) => o.room_id !== roomId), ...liveOpenings] : openings;
    return levelPlanFor(rooms, allLoci, allOpenings, levels, roomId);
  }, [rooms, loci, openings, levels, roomId, liveLoci, liveOpenings]);
}
