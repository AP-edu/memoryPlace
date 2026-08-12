import type { Session } from "next-auth";

export function canModify(session: Session | null, owner: string): boolean {
  if (!session) return false;
  return session.user.role === "admin" || owner === session.user.id;
}