"use client";

import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import type { Database } from "@/lib/database.types";

// lib/env.ts checks server-only variables too, so the browser reads the two
// public values directly; Next inlines them at build time.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// The browser's client is the authenticated one, never a bare one: the
// realtime socket opens with the same Clerk token the policies read, which is
// why that token is readable from the page at all. Null until Clerk has a session.
export function useBrowserSupabase(): SupabaseClient<Database> | null {
  const { session } = useSession();
  return useMemo(() => {
    if (!session) return null;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing");
    return createClient<Database>(url, key, { accessToken: () => session.getToken() });
  }, [session]);
}
