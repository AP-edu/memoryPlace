import { notFound } from "next/navigation";
import { GridEditorDemo } from "./GridEditorDemo";

// Dev-only demo of the grid editor with mock data and an in-memory backend
// (no database, no auth). Returns 404 in production builds.
export default function GridEditorDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-semibold">Grid editor — dev demo</h1>
      <p className="mb-4 text-sm text-muted-foreground">Mock palace, in-memory saves (nothing is persisted). Dev only.</p>
      <GridEditorDemo />
    </div>
  );
}
