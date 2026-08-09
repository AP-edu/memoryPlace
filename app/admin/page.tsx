
"use client";
import { useFetch } from "@/hooks/useFetch";

interface Course {
  id: string;
  title: string;
  owner: string;
}

export default function AdminDashboard() {
  const { data: courses, loading, refetch } = useFetch<Course[]>("/api/courses");

  async function handleDelete(id: string) {
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    refetch();
  }

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Admin: All Courses</h1>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Title</th>
            <th className="py-2">Owner</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {courses?.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2">{c.title}</td>
              <td className="py-2 text-sm text-gray-500">{c.owner}</td>
              <td className="py-2 text-right">
                <button onClick={() => handleDelete(c.id)} className="text-red-600 text-sm hover:underline">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}