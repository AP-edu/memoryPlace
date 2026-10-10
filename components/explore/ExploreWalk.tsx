"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Hammer } from "lucide-react";
import { templateById, templateWorld } from "@/lib/templates";
import { levelPlanFor } from "@/lib/blueprint";
import WalkView, { type WalkWorld } from "@/components/scene3d/WalkView";
import { useRoomAccent } from "@/hooks/useRoomAccent";
import { useBuildTemplate } from "./TemplateGallery";

/**
 * A famous place walked straight from its template (in memory, nothing
 * saved): every room on one level, doors leading on, loci waiting for cards.
 */
export default function ExploreWalk({ id }: { id: string }) {
  const t = templateById(id)!;
  const world = useMemo(() => templateWorld(t), [t]);
  const [currentId, setCurrentId] = useState(world.rooms[0].id);
  const room = world.rooms.find((r) => r.id === currentId) ?? world.rooms[0];
  const { status } = useSession();
  const { build, busy, error } = useBuildTemplate();
  const accent = useRoomAccent(room.background);

  const walkWorld = useMemo<WalkWorld>(
    () => ({ rooms: world.rooms, openings: world.openings, loci: world.loci, fallbackLevelId: world.level.id }),
    [world]
  );
  const loci = useMemo(() => world.loci.filter((l) => l.room_id === room.id), [world, room.id]);
  const openings = useMemo(() => world.openings.filter((o) => o.room_id === room.id), [world, room.id]);
  const levelPlan = useMemo(() => levelPlanFor(world.rooms, world.loci, world.openings, [world.level], room.id), [world, room.id]);
  const roomTitles = useMemo(() => Object.fromEntries(world.rooms.map((r) => [r.id, r.title])), [world]);

  return (
    <div style={accent}>
      <WalkView
        room={room}
        loci={loci}
        openings={openings}
        cards={[]}
        roomTitles={roomTitles}
        world={walkWorld}
        onEnterRoom={setCurrentId}
        levelPlan={levelPlan}
        intro
        // Signed out there is no navbar: the walk fills the screen.
        className={status === "authenticated" ? "h-[calc(100dvh-3.5rem)]" : "h-dvh"}
        actions={
          <>
            <Link href="/explore" className="btn-outline bg-card max-sm:!px-3 max-sm:!py-1.5">
              {"←"} Places
            </Link>
            {status === "authenticated" ? (
              <button type="button" onClick={() => build(t)} disabled={!!busy} className="btn-primary max-sm:!px-3 max-sm:!py-1.5" title={error ?? undefined}>
                <Hammer className="h-4 w-4" aria-hidden /> {busy ? "Building..." : error ? "Try again" : "Build it"}
              </button>
            ) : (
              <Link href="/signup" className="btn-primary max-sm:!px-3 max-sm:!py-1.5">
                Make it yours
              </Link>
            )}
          </>
        }
      />
    </div>
  );
}
