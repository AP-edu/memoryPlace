"use client";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import type { Locus, Opening, Room } from "@/types/database";
import Room3DViewer from "@/components/scene3d/Room3DViewer";
import { tourOrder } from "@/lib/scene3d";

// Palace-page preview: orbit view of the selected room (all openings, numbered
// study path). Editing happens in the room's 3D editor; walking in /walk.
export function Room3DPreview({ room }: { room: Room }) {
  const { data: loci } = useFetch<Locus[]>(`/api/loci?room=${room.id}`);
  const { data: openings } = useFetch<Opening[]>(`/api/openings?room=${room.id}`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ordered = tourOrder(loci ?? []);
  const index = ordered.findIndex((l) => l.id === selectedId);
  const selected = index >= 0 ? ordered[index] : null;

  return (
    <div>
      <Room3DViewer room={room} loci={loci ?? []} openings={openings ?? []} selectedId={selectedId} onSelect={setSelectedId} />
      <p className="mt-2 min-h-5 text-sm text-muted-foreground">
        {selected ? (
          <>
            <strong className="text-foreground">
              {index + 1}. {selected.label || "Untitled"}
            </strong>{" "}
            on the {selected.wall ?? "north"} wall
          </>
        ) : ordered.length > 0 ? (
          `${ordered.length} loci · drag to orbit, click a marker`
        ) : (
          "No loci yet: open the room in 3D to place some."
        )}
      </p>
    </div>
  );
}
