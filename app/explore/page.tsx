import type { Metadata } from "next";
import Link from "next/link";
import TemplateGallery from "@/components/explore/TemplateGallery";

export const metadata: Metadata = {
  title: "Famous places",
  description: "Walk the Parthenon, a Pompeii townhouse, Tutankhamun's tomb and more in 3D, then make one your memory palace.",
};

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-highlight">Famous places</p>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Walk somewhere you can picture</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        The best memory palaces are places you can see with your eyes closed. Walk these in 3D right now, then build one as your
        own palace: every room, door and piece of furniture, with loci on the walls waiting for your cards. Reshape it on the
        blueprint and in the 3D studio, or start from a home and rebuild yours.
      </p>
      <div className="mt-8">
        <TemplateGallery />
      </div>
      <p className="mt-10 text-center text-sm text-muted-foreground">
        Rather draw your own?{" "}
        <Link href="/palaces" className="text-link hover:underline">
          Start a blank palace
        </Link>
      </p>
    </div>
  );
}
