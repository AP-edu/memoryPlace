import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TEMPLATES, templateById } from "@/lib/templates";
import ExploreWalk from "@/components/explore/ExploreWalk";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = templateById((await params).id);
  return t ? { title: `Walk ${t.name}`, description: t.blurb } : {};
}

/** Walk a famous place in 3D: no account needed (builds into a palace when signed in). */
export default async function ExploreWalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!templateById(id)) notFound();
  return <ExploreWalk id={id} />;
}
