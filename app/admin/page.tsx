"use client";
import { useFetch } from "@/hooks/useFetch";
import type { Course } from "@/types/database";

export default function AdminDashboard() {
  const { data: courses, loading, error, refetch } = useFetch<Course[]>("/api/courses");

  async function handleDelete(id: string) {
    if (!confirm("Remove this course?")) return;
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    refetch();
  }

  if (loading) return <p className="p-6 text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load courses: {error}</p>;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-3xl font-semibold">All Courses</h1>
      <p className="mb-5 text-sm text-muted-foreground">Admin view — every room in the palace.</p>
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
            {courses?.map((c) => (
              <tr key={c.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                <td className="py-2.5 pl-3">{c.title}</td>
                <td className="py-2.5 text-sm text-muted-foreground">{c.owner}</td>
                <td className="py-2.5 pr-3 text-right">
                  <button onClick={() => handleDelete(c.id)} className="btn-danger !text-xs">
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