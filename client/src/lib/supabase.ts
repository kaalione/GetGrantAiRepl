import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// sb_publishable_... is the current key type; the legacy anon key still works.
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

// Null when Supabase env vars are missing — the auth page shows a
// configuration notice instead of crashing the app.
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null;

// Exchanges a Supabase access token for a server session cookie. Must be
// called after every successful Supabase sign-in.
export async function establishServerSession(accessToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Login failed (${res.status})`);
  }
}
