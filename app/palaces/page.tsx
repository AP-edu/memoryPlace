"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import PalaceList from "@/components/palaces/PalaceList";
import type { HomeSummary } from "@/lib/homeSummary";
import { PageSkeleton } from "@/components/ui/Skeleton";

// Palaces are the heart of the app: a forefront tab with the full list,
// search, and quick Open / Walk / Study actions. /home keeps the dashboard.
export default function PalacesPage() {
  const { status } = useSession();
  const router = useRouter();
  const { data: summary, loading, error, refetch } = useFetch<HomeSummary>(
    `/api/home/summary?tz=${new Date().getTimezoneOffset()}`
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || loading) return <PageSkeleton label="Loading palaces" />;
  if (error) return <p className="p-6 text-destructive">Failed to load palaces: {error}</p>;
  if (!summary) return <p className="p-6 text-muted-foreground">Nothing here yet.</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-semibold">Palaces</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Design rooms, place loci on the walls, then walk them in 3D. {summary.palaces.length} palace
        {summary.palaces.length === 1 ? "" : "s"} · {summary.totalCards} card{summary.totalCards === 1 ? "" : "s"}
      </p>
      <PalaceList palaces={summary.palaces} plans={summary.plans} onChanged={refetch} searchable />
    </div>
  );
}
