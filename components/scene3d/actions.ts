import type { Locus, WallFace } from "@/types/database";

// Persistence for loci + cards used by the 3D room editor. The room page
// implements it over the /api routes (same endpoints as the 2D editor, so both
// views edit the same rows); the dev demo implements it in memory.

export interface NewLocus {
  room_id: string;
  label: string;
  wall: WallFace;
  wall_offset: number;
  height: number;
  position: number;
}

export type LocusPatch = Partial<Pick<Locus, "label" | "wall" | "wall_offset" | "height" | "position">>;

export interface LociActions {
  createLocus(input: NewLocus): Promise<Locus>;
  updateLocus(id: string, patch: LocusPatch): Promise<void>;
  /** Apply several position updates (reorder) in one go. */
  setPositions(updates: Array<{ id: string; position: number }>): Promise<void>;
  deleteLocus(id: string): Promise<void>;
  createCard(input: { locus_id: string; front: string; back: string; options?: string[] }): Promise<void>;
  updateCard(id: string, patch: { front?: string; back?: string; options?: string[]; position?: number }): Promise<void>;
  deleteCard(id: string): Promise<void>;
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) message = j.error;
    } catch {
      // generic
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** HTTP implementation; `onChanged` lets the page refetch shared data (keeps the 2D view in sync). */
export function httpLociActions(onChanged: (what: "loci" | "cards") => void): LociActions {
  return {
    async createLocus(input) {
      const l = await call<Locus>("/api/loci", "POST", input);
      onChanged("loci");
      return l;
    },
    async updateLocus(id, patch) {
      await call(`/api/loci/${id}`, "PUT", patch);
      onChanged("loci");
    },
    async setPositions(updates) {
      await Promise.all(updates.map((u) => call(`/api/loci/${u.id}`, "PUT", { position: u.position })));
      onChanged("loci");
    },
    async deleteLocus(id) {
      await call(`/api/loci/${id}`, "DELETE");
      onChanged("loci");
      onChanged("cards");
    },
    async createCard(input) {
      await call("/api/cards", "POST", input);
      onChanged("cards");
    },
    async updateCard(id, patch) {
      await call(`/api/cards/${id}`, "PUT", patch);
      onChanged("cards");
    },
    async deleteCard(id) {
      await call(`/api/cards/${id}`, "DELETE");
      onChanged("cards");
    },
  };
}
