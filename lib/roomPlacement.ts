import { supabase } from "@/lib/supabase";
import { isFiniteNum, MAX_COORD, ROTATIONS } from "@/lib/validate";

/**
 * Validate grid-editor placement fields from a rooms POST/PUT body.
 * Only keys present in `body` are returned. `level_id` must be a level of
 * `palaceId` (or null to unassign).
 */
export async function placementUpdates(
  body: Record<string, unknown>,
  palaceId: string
): Promise<{ updates: Record<string, unknown> } | { error: string }> {
  const updates: Record<string, unknown> = {};
  const { level_id, pos_x, pos_z, rotation } = body;

  if (level_id !== undefined) {
    if (level_id === null) {
      updates.level_id = null;
    } else {
      if (typeof level_id !== "string") return { error: "Invalid level" };
      const { data: level } = await supabase.from("levels").select("id, palace_id").eq("id", level_id).maybeSingle();
      if (!level || level.palace_id !== palaceId) return { error: "Invalid level" };
      updates.level_id = level_id;
    }
  }
  for (const [key, value] of [
    ["pos_x", pos_x],
    ["pos_z", pos_z],
  ] as const) {
    if (value === undefined) continue;
    if (!isFiniteNum(value) || Math.abs(value) > MAX_COORD) return { error: `Invalid ${key}` };
    updates[key] = value;
  }
  if (rotation !== undefined) {
    if (!ROTATIONS.includes(rotation as (typeof ROTATIONS)[number])) return { error: "Invalid rotation" };
    updates.rotation = rotation;
  }
  return { updates };
}

/** Lowest level of a palace (used when a room is created without level_id). */
export async function defaultLevelId(palaceId: string): Promise<string | null> {
  const { data } = await supabase
    .from("levels")
    .select("id")
    .eq("palace_id", palaceId)
    .order("idx", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
