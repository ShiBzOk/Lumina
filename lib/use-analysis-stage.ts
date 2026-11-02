"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readStageEvent, type StageEvent } from "@/lib/stages";
import { useBrowserSupabase } from "@/lib/supabase-browser";

const key = (e: StageEvent) => `${e.status}|${e.stage}|${e.message}`;

/**
 * The stage of one analysis, as the database publishes it. Subscribes to the
 * private analysis:<id> channel only while the run is unfinished; nothing here
 * polls. `initial` is what the server rendered.
 *
 * Once subscribed, the server render is refreshed a single time, so a stage
 * that moved between the render and the subscription isn't missed. When the
 * run ends the page is refreshed too, so it can show the finished state.
 */
export function useAnalysisStage(id: string, initial: StageEvent): { event: StageEvent; unavailable: boolean } {
  const supabase = useBrowserSupabase();
  const router = useRouter();
  const [live, setLive] = useState(initial);
  // True while the channel is refused or down. The client keeps retrying, and
  // a successful rejoin clears it.
  const [unavailable, setUnavailable] = useState(false);
  // A fresh server render replaces whatever was heard before it.
  const [rendered, setRendered] = useState(key(initial));
  // Bumped when the server closes the channel, which tears it down for good.
  // The rejoin is a fresh channel, and its SUBSCRIBED refresh catches up on
  // whatever was published while it was gone.
  const [joins, setJoins] = useState(0);
  if (rendered !== key(initial)) {
    setRendered(key(initial));
    setLive(initial);
  }

  const finished = live.status === "complete" || live.status === "failed";

  useEffect(() => {
    if (!supabase || finished) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      // A private channel is joined with the token, so it has to be set first.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`analysis:${id}`, { config: { private: true } })
        .on("broadcast", { event: "stage" }, ({ payload }) => {
          const event = readStageEvent(payload);
          if (!event) return;
          setLive(event);
          if (event.status === "complete" || event.status === "failed") router.refresh();
        })
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            setUnavailable(false);
            router.refresh();
          }
          // Refused by the policy, or the socket failed: the page says so
          // rather than sitting there looking idle.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setUnavailable(true);
            console.warn(`Live progress for analysis ${id} is unavailable:`, err?.message ?? status);
          }
          // Our own cleanup closes it too; only a close from the server rejoins.
          // A run outlives the ~60s Clerk token it joined with, and the server
          // closes a private channel when that token expires.
          if (status === "CLOSED" && !cancelled) {
            console.warn(`Live progress for analysis ${id} was closed by the server; rejoining.`);
            setJoins((n) => n + 1);
          }
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, id, finished, router, joins]);

  return { event: live, unavailable: unavailable && !finished };
}
