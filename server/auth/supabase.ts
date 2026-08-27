import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Server-side Supabase client, used only to verify access tokens issued to
// the browser (supabase.auth.getUser(jwt) calls Supabase's user endpoint,
// which validates signature and expiry). The publishable key (sb_publishable_...,
// successor of the legacy anon key) is sufficient.
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
