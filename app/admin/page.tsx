"use client";
import { useFetch } from "@/hooks/useFetch";
import type { Palace } from "@/types/database";

export default function AdminDashboard() {
  const { data: palaces, loading, error, refetch } = useFetch<Palace[]>("/api/palaces?all=1");

  async function handleDelete(id: string) {
    if (!confirm("Remove this palace and everything in it?")) return;
    const res = await fetch(`/api/palaces/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    refetch();
  }

  if (loading) return <p className="p-6 text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load palaces: {error}</p>;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-3xl font-semibold">All Palaces</h1>
      <p className="mb-5 text-sm text-muted-foreground">Admin view — every palace in the realm.</p>
      <div className="card-base overflow-x-auto p-2">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted-foreground">
              <th className="py-2.5 pl-3 font-medium">Title</th>
              <th className="py-2.5 font-medium">Owner</th>
              <th className="py-2.5 pr-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {palaces?.map((p) => (
              <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                <td className="py-2.5 pl-3">{p.title}</td>
                <td className="py-2.5 text-sm text-muted-foreground">{p.user_id}</td>
                <td className="py-2.5 pr-3 text-right">
                  <button onClick={() => handleDelete(p.id)} className="btn-danger !text-xs">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
