import { createAdminClient } from "@supabase/server/core";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  try {
    client = createAdminClient();
  } catch (err) {
    throw new Error(`Missing Supabase environment variables: ${(err as Error).message}`);
  }
  return client;
}