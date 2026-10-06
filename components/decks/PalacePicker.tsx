"use client";
import { useEffect } from "react";
import { useFetch } from "@/hooks/useFetch";
import { tourOrder } from "@/lib/scene3d";
import type { Locus, Palace, Room } from "@/types/database";

export interface PalaceTarget {
  palaceId: string;
  roomId: string;
  locusId: string;
}

/** Palace -> room (-> locus) cascade shared by the port dialogs. */
export default function PalacePicker({
  value,
  onChange,
  withLocus = false,
}: {
  value: PalaceTarget;
  onChange: (next: PalaceTarget) => void;
  withLocus?: boolean;
}) {
  const { data: palaces } = useFetch<Palace[]>("/api/palaces");
  const { data: rooms } = useFetch<Room[]>(value.palaceId ? `/api/rooms?palace=${value.palaceId}` : null);
  const { data: loci } = useFetch<Locus[]>(withLocus && value.roomId ? `/api/loci?room=${value.roomId}` : null);

  // Default to the first palace once loaded.
  useEffect(() => {
    if (!value.palaceId && palaces && palaces.length > 0) {
      onChange({ palaceId: palaces[0].id, roomId: "", locusId: "" });
    }
  }, [palaces, value.palaceId, onChange]);

  return (
    <div className="space-y-2">
      <select
        className="input-base"
        value={value.palaceId}
        onChange={(e) => onChange({ palaceId: e.target.value, roomId: "", locusId: "" })}
      >
        <option value="">Pick a palace…</option>
        {(palaces ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      {value.palaceId && (
        <select
          className="input-base"
          value={value.roomId}
          onChange={(e) => onChange({ ...value, roomId: e.target.value, locusId: "" })}
        >
          <option value="">{rooms && rooms.length === 0 ? "No rooms yet — add one in the palace" : "Pick a room…"}</option>
          {(rooms ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      )}
      {withLocus && value.roomId && (
        <select
          className="input-base"
          value={value.locusId}
          onChange={(e) => onChange({ ...value, locusId: e.target.value })}
        >
          <option value="">Pick a locus…</option>
          {tourOrder(loci ?? []).map((l, i) => (
            <option key={l.id} value={l.id}>
              {i + 1}. {l.label || "Unlabelled locus"}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
