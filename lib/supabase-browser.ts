"use client";

import { useClerk, useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import type { Database } from "@/lib/database.types";

// lib/env.ts checks server-only variables too, so the browser reads the two
// public values directly; Next inlines them at build time.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// One client per signed-in session, shared by every component that asks, so a
// dashboard of unfinished rows opens one realtime socket rather than one each.
let shared: { sessionId: string; client: SupabaseClient<Database> } | null = null;

type Clerk = ReturnType<typeof useClerk>;

function clientFor(sessionId: string, clerk: Clerk): SupabaseClient<Database> {
  if (shared?.sessionId !== sessionId) {
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing");
    // The token is read from Clerk's current session on every call, so a
    // client that outlives a session object still sends a live token.
    const client = createClient<Database>(url, key, { accessToken: async () => (await clerk.session?.getToken()) ?? null });
    shared = { sessionId, client };
  }
  return shared.client;
}

// The browser's client is the authenticated one, never a bare one: the
// realtime socket opens with the same Clerk token the policies read, which is
// why that token is readable from the page at all. Null until Clerk has a session.
export function useBrowserSupabase(): SupabaseClient<Database> | null {
  const clerk = useClerk();
  const { session } = useSession();
  const sessionId = session?.id ?? null;
  return useMemo(() => (sessionId ? clientFor(sessionId, clerk) : null), [sessionId, clerk]);
}
