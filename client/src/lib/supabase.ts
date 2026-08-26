import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when Supabase env vars are missing — the auth page shows a
// configuration notice instead of crashing the app.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

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
