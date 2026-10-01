import { supabase } from "@/lib/supabase";
import { DEFAULT_OPENING_WIDTH_M, wallLength } from "@/lib/geometry";
import type { OpeningKind, WallFace } from "@/types/database";

type RoomSize = { id: string; palace_id: string; width: number; depth: number };

const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Resolve the two width columns for an opening on `wall` of `room`.
 * width_m (metres) is authoritative; `width` (fraction of wall) is kept in
 * sync for older readers. Accepts either input; defaults by kind.
 */
export function openingWidthFields(
  wall: WallFace,
  room: { width: number; depth: number },
  input: { width?: unknown; width_m?: unknown },
  kind: OpeningKind = "door"
): { fields: { width: number; width_m: number } } | { error: string } {
  const len = wallLength(wall, room);
  if (!(len > 0)) return { error: "Invalid room size" };
  let metres: number;
  if (input.width_m !== undefined) {
    if (!pos(input.width_m)) return { error: "width_m must be a positive number" };
    metres = input.width_m;
  } else if (input.width !== undefined) {
    if (!pos(input.width)) return { error: "width must be a positive number" };
    metres = Math.min(1, input.width) * len;
  } else {
    metres = DEFAULT_OPENING_WIDTH_M[kind];
  }
  metres = Math.min(metres, len);
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return { fields: { width_m: round(metres), width: round(metres / len) } };
}

/** target_room_id must be a different room in the same palace. */
export async function validTargetRoom(targetId: unknown, room: RoomSize): Promise<boolean> {
  if (typeof targetId !== "string" || targetId === room.id) return false;
  const { data } = await supabase.from("rooms").select("id, palace_id").eq("id", targetId).maybeSingle();
  return !!data && data.palace_id === room.palace_id;
}
