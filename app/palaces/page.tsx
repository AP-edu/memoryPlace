"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import type { Palace } from "@/types/database";

export default function PalacesPage() {
  const { data: palaces, loading, error, refetch } = useFetch<Palace[]>("/api/palaces");
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError("Title required");
    const res = await fetch("/api/palaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return setFormError("Failed to create palace");
    setFormError(null);
    setTitle("");
    refetch();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this palace and everything in it?")) return;
    const res = await fetch(`/api/palaces/${id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete palace");
    refetch();
  }

  if (loading) return <p className="p-6 text-muted-foreground">Loading palaces...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load palaces: {error}</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-3xl font-semibold">My Palaces</h1>
      <p className="mb-6 text-sm text-muted-foreground">Each palace is a building for knowledge — rooms hold loci, loci hold cards.</p>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New palace title"
          className="input-base flex-1"
        />
        <button className="btn-primary">Add</button>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      {palaces?.length === 0 && <p className="text-muted-foreground">No palaces yet — raise the first one above.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {palaces?.map((palace) => (
          <Link
            key={palace.id}
            href={`/palaces/${palace.id}`}
            className="card-base group p-4 hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between">
              <span className="font-medium transition-colors group-hover:text-primary">{palace.title}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(palace.id);
                }}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
            {palace.description && (
              <p className="mt-1 text-sm text-muted-foreground">{palace.description}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
