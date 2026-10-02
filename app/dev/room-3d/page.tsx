import { notFound } from "next/navigation";
import { Room3DDemo } from "./Room3DDemo";

// Dev-only demo of the 3D room editor + walk/tour mode with mock data and
// in-memory saves (no database, no auth). Returns 404 in production builds.
export default function Room3DDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-semibold">3D loci: dev demo</h1>
      <p className="mb-4 text-sm text-muted-foreground">Two linked mock rooms, in-memory saves (nothing is persisted). Dev only.</p>
      <Room3DDemo />
    </div>
  );
}
