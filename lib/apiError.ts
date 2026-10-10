import { NextResponse } from "next/server";

/** Log a database/server error and return a generic 500 — never leak PG messages to clients. */
export function serverError(where: string, error: unknown, message = "Request failed") {
  console.error(where, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Like serverError, but a malformed id (PG 22P02, e.g. not a uuid) is a plain 404. */
export function lookupFailed(where: string, error: unknown) {
  if ((error as { code?: string } | null)?.code === "22P02") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return serverError(where, error);
}
