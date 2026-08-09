

"use client";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";

interface Course {
  id: string;
  title: string;
  description: string;
}

export default function Dashboard() {
  const { data: courses, loading, refetch } = useFetch<Course[]>("/api/courses");
  const [title, setTitle] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    refetch();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    refetch();
  }

  if (loading) return <p className="p-6 text-gray-500">Loading courses...</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">My Courses</h1>
      <form onSubmit={handleCreate} className="flex gap-2 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New course title"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Add
        </button>
      </form>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses?.map((course) => (
          <div key={course.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <span className="font-medium">{course.title}</span>
              <button onClick={() => handleDelete(course.id)} className="text-red-600 text-sm hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}