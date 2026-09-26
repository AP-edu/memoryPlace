"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Palace, Room } from "@/types/database";

export default function PalacePage() {
  const { id } = useParams<{ id: string }>();
  const { data: palace } = useFetch<Palace>(id ? `/api/palaces/${id}` : null);
  const { data: rooms, loading, error, refetch } = useFetch<Room[]>(
    id ? `/api/rooms?palace=${id}` : null
  );

  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError("Title required");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, palace_id: id }),
    });
    if (!res.ok) return setFormError("Failed to create room");
    setFormError(null);
    setTitle("");
    refetch();
  }

  async function handleDelete(roomId: string) {
    if (!confirm("Delete this room, its loci, and its cards?")) return;
    const res = await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete room");
    refetch();
  }

  if (!id) return <p className="p-6">This palace link is missing an id.</p>;
  if (loading) return <p className="p-6 text-muted-foreground">Loading rooms...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load rooms: {error}</p>;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/palaces" className="btn-ghost">
        {"\u2190 Back to palaces"}
      </Link>
      <h1 className="mb-1 mt-3 text-3xl font-semibold">{palace?.title ?? "Palace"} Rooms</h1>
      <p className="mb-5 text-sm text-muted-foreground">Each room is a chamber — place loci inside, then walk them.</p>

      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New room title"
          className="input-base flex-1"
        />
        <button className="btn-primary">Add</button>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      {rooms?.length === 0 && <p className="text-muted-foreground">No rooms yet — add one above.</p>}

      <div className="space-y-3">
        {rooms?.map((room) => (
          <div key={room.id} className="card-base flex items-center justify-between p-4">
            <span className="font-display text-lg font-medium">{room.title}</span>
            <div className="flex items-center gap-4 text-sm">
              <Link href={`/study/${room.id}`} className="btn-primary `px-3` `py-1.5`">
                Study
              </Link>
              <Link href={`/rooms/${room.id}`} className="btn-ghost">
                Design loci
              </Link>
              <button onClick={() => handleDelete(room.id)} className="btn-danger">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
