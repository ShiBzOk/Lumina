import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

// The only way to get a database client for reading. Every request carries the
// Clerk session token, so policies can read the organization claim off it.
// Supabase never owns a session here: no auth cookies, no refresh, nothing persisted.
export function createServerSupabase() {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    async accessToken() {
      return (await auth()).getToken();
    },
  });
}

// The pipeline's writer, and nothing else's. A run outlives the minute a Clerk
// token lasts, so it can't write as the user; it writes with the secret key,
// which bypasses policies. That is why the organization it writes under is
// always the one read off the verified token when the run was requested, and
// why reads never go through this client.
export function createWriterSupabase() {
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
