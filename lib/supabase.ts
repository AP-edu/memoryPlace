
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY as string;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false },
});