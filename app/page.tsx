
import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto p-6 mt-20 text-center">
      <h1 className="text-4xl font-bold mb-3">Memory Palace Lite</h1>
      <p className="text-gray-600 mb-8">
        Organize your study material into courses, decks, and flashcards — then quiz yourself.
      </p>
      <div className="flex gap-4 justify-center">
        <Link href="/login" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700">
          Log In
        </Link>
        <Link href="/signup" className="border border-blue-600 text-blue-600 px-5 py-2 rounded-lg hover:bg-blue-50">
          Sign Up
        </Link>
      </div>
    </div>
  );
}
