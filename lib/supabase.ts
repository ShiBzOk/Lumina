import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// The only way to get a database client. Every request carries the Clerk
// session token, so policies can read the organization claim off it. Supabase
// never owns a session here: no auth cookies, no refresh, nothing persisted.
export function createServerSupabase() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    async accessToken() {
      return (await auth()).getToken();
    },
  });
}
