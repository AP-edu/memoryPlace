"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DemoBlueprint from "@/components/DemoBlueprint";

const STEPS = [
  {
    title: "Draw the place",
    body: "Rooms on a clean 2D blueprint, doors and archways on shared walls. Simple enough to rebuild in your head.",
  },
  {
    title: "Hang what you learn",
    body: "Place numbered loci on the walls and attach the cards you want to remember to each one.",
  },
  {
    title: "Walk it to recall",
    body: "Walk the palace in first person. Recall at every locus; what you miss comes back sooner.",
  },
];

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  // Signed-in users get the dedicated homepage; this route stays the
  // logged-out landing.
  useEffect(() => {
    if (status === "authenticated") router.replace("/home");
  }, [status, router]);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-16 sm:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
        <div className="text-center lg:text-left">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-highlight">The method of loci, made walkable</p>
          <h1 className="text-5xl font-semibold leading-tight sm:text-6xl">MemoryPlace</h1>
          <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground lg:mx-0">
            Build a palace, hang what you need to remember on its walls, then walk it until you can do it with your eyes closed.
          </p>
          <div className="mt-8 flex justify-center gap-3 lg:justify-start">
            <Link href="/signup" className="btn-primary">
              Build your first palace →
            </Link>
            <Link href="/login" className="btn-outline">
              Log in
            </Link>
          </div>
        </div>
        <figure className="card-base p-4 sm:p-6">
          <DemoBlueprint className="w-full" />
          <figcaption className="mt-3 text-center text-xs text-muted-foreground">
            Three rooms, twelve loci. The gold walker follows the study route, room by room, through the doors.
          </figcaption>
        </figure>
      </div>

      <ol className="mt-16 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card-base p-5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
            <h2 className="mt-3 text-xl font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      <p className="mx-auto mt-12 max-w-xl text-center font-display text-lg italic text-muted-foreground">
        Greek and Roman orators memorised whole speeches by walking an imagined building, one image per spot. MemoryPlace gives
        you the building.
      </p>
    </div>
  );
}
