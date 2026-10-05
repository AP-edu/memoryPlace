import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept both legacy (SERVICE_ROLE/ANON) and current Supabase dashboard
  // (SECRET/PUBLISHABLE, sb_secret_…/sb_publishable_…) key names.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)"
    );
  }
  client = createClient(url, key);
  return client;
}

// Lazy proxy so `import { supabase }` doesn't throw at build time when env
// vars are absent — the error surfaces on first actual DB access instead.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabase();
    const value = (c as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? (value as () => unknown).bind(c) : value;
  },
});
