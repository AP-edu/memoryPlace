import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { serverError } from "@/lib/apiError";
import { templateById, templateWorld } from "@/lib/templates";

/**
 * Build a palace from a famous-place template (lib/templates): one level,
 * every room with its furniture, linked door pairs and the suggested loci.
 * All or nothing: a failure part-way deletes the palace (rooms, doors and
 * loci cascade).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).template : null;
  const t = typeof id === "string" ? templateById(id) : null;
  if (!t) return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  const rawTitle = (body as Record<string, unknown>).title;
  if (rawTitle !== undefined && (typeof rawTitle !== "string" || rawTitle.length > 120)) {
    return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  }
  const title = (typeof rawTitle === "string" && rawTitle.trim()) || t.name;
  const world = templateWorld(t);

  const { data: palace, error: palaceError } = await supabase
    .from("palaces")
    .insert({
      title,
      description: `${t.place} · ${t.era}. ${t.blurb}`,
      theme: { template: t.id },
      visibility: "private",
      user_id: session.user.id,
    })
    .select()
    .single();
  if (palaceError || !palace) return serverError("api/palaces/from-template palace", palaceError);

  const fail = async (step: string, error: unknown) => {
    await supabase.from("palaces").delete().eq("id", palace.id);
    return serverError(`api/palaces/from-template ${step}`, error);
  };

  const { data: level, error: levelError } = await supabase
    .from("levels")
    .insert({ palace_id: palace.id, idx: 0, name: "Ground", elevation: 0, default_height: 3 })
    .select()
    .single();
  if (levelError || !level) return fail("level", levelError);

  // Creation order is the palace's room order (tours, practice): stamp it.
  const base = Date.now();
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .insert(
      world.rooms.map((r, i) => ({
        title: r.title,
        palace_id: palace.id,
        user_id: session.user.id,
        background: r.background,
        metadata: r.metadata,
        width: r.width,
        depth: r.depth,
        height: r.height,
        level_id: level.id,
        pos_x: r.pos_x,
        pos_z: r.pos_z,
        rotation: 0,
        created_at: new Date(base + i * 10).toISOString(),
      }))
    )
    .select("id, title");
  if (roomsError || !rooms || rooms.length !== world.rooms.length) return fail("rooms", roomsError);
  // Titles are unique within a template (lib/templates.test.ts).
  const idOf = new Map<string, string>();
  for (const r of world.rooms) {
    const saved = rooms.find((x: { id: string; title: string }) => x.title === r.title);
    if (!saved) return fail("rooms", new Error(`room ${r.title} missing after insert`));
    idOf.set(r.id, saved.id);
  }

  const { error: openingsError } = await supabase.from("openings").insert(
    world.openings.map((o) => ({
      room_id: idOf.get(o.room_id),
      wall: o.wall,
      wall_offset: o.wall_offset,
      width: o.width,
      width_m: o.width_m,
      kind: o.kind,
      target_room_id: o.target_room_id ? idOf.get(o.target_room_id) : null,
    }))
  );
  if (openingsError) return fail("openings", openingsError);

  if (world.loci.length > 0) {
    const { error: lociError } = await supabase.from("loci").insert(
      world.loci.map((l) => ({
        room_id: idOf.get(l.room_id),
        label: l.label,
        x: l.x,
        y: l.y,
        z: l.z,
        tags: [],
        wall: l.wall,
        wall_offset: l.wall_offset,
        height: l.height,
        position: l.position,
      }))
    );
    if (lociError) return fail("loci", lociError);
  }

  return NextResponse.json({ id: palace.id, title, firstRoomId: idOf.get(world.rooms[0].id) }, { status: 201 });
}
