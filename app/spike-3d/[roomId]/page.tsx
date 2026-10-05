import { redirect } from "next/navigation";

// The Phase A geometry spike has been superseded by the 3D room editor.
export default async function Spike3DRedirect({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  redirect(`/rooms/${roomId}`);
}
