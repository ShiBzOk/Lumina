"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markAllNotificationsRead, openNotification, readInbox, unreadNotifications } from "@/app/notifications/actions";
import { Icon } from "@/components/map/icons";
import { INBOX_LIMIT, type InboxItem } from "@/lib/inbox";
import { versionName } from "@/lib/stages";
import { useBrowserSupabase } from "@/lib/supabase-browser";

/**
 * The count of unread notifications, kept current by the person's own private
 * channel: the database pings it whenever one of theirs is added, read or
 * removed, and the count is asked for again. Nothing polls. The list is read
 * only when the inbox is opened.
 *
 * A new notification changes the number and nothing else: no toast, no sound,
 * no animation, no title change.
 */
export function Inbox({ topic, initial }: { topic: string; initial: number }) {
  const supabase = useBrowserSupabase();
  const router = useRouter();
  const [unread, setUnread] = useState(initial);
  // A fresh server render replaces whatever was counted before it.
  const [rendered, setRendered] = useState(initial);
  if (rendered !== initial) {
    setRendered(initial);
    setUnread(initial);
  }
  // True while the channel is refused or down; the client keeps retrying.
  const [unavailable, setUnavailable] = useState(false);
  // Bumped when the server closes the channel, which happens when the token it
  // joined with expires. The rejoin's SUBSCRIBED recount catches up.
  const [joins, setJoins] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const recount = async () => {
      const result = await unreadNotifications();
      if (cancelled) return;
      if (result.ok) setUnread(result.unread);
      else console.warn("Could not count notifications:", result.error);
    };
    void (async () => {
      // A private channel is joined with the token, so it has to be set first.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => void recount())
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            setUnavailable(false);
            void recount();
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setUnavailable(true);
            console.warn("Live notifications are unavailable:", err?.message ?? status);
          }
          // Our own cleanup closes it too; only a close from the server rejoins.
          if (status === "CLOSED" && !cancelled) setJoins((n) => n + 1);
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, topic, joins]);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node && root.current?.contains(e.target))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    setItems(null);
    setError(null);
    const result = await readInbox();
    if (result.ok) setItems(result.items);
    else setError(result.error);
  };

  const go = async (item: InboxItem) => {
    setOpening(item.id);
    setError(null);
    const result = await openNotification(item.id);
    setOpening(null);
    if (!result.ok) return setError(result.error);
    if (!item.read) setUnread((n) => Math.max(0, n - 1));
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, read: true } : i)) ?? null);
    setOpen(false);
    // A map keeps its view for as long as it is on screen, so a notification
    // for the map already showing is opened as a fresh page to select its file.
    const target = new URL(result.href, window.location.href);
    if (target.pathname === window.location.pathname) window.location.assign(target.href);
    else router.push(result.href);
  };

  const markAll = async () => {
    setError(null);
    const result = await markAllNotificationsRead();
    if (!result.ok) return setError(result.error);
    setUnread(0);
    setItems((prev) => prev?.map((i) => ({ ...i, read: true })) ?? null);
  };

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        data-tip={open ? undefined : unavailable ? "Notifications · live updates unavailable" : "Notifications"}
        onClick={() => void toggle()}
        className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-muted hover:bg-background"
      >
        <Icon name="bell" className="size-3.5" />
        {unavailable && <Icon name="alert" className="size-3 text-danger" />}
        {unread > 0 && <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">{unread}</span>}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-80 overflow-hidden rounded-xl bg-surface shadow-[0_8px_24px_rgba(16,24,40,0.12)] ring-1 ring-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold">Notifications</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={!items?.some((i) => !i.read) && unread === 0}
              className="text-[10px] text-muted hover:text-foreground disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
          {unavailable && (
            <p className="border-b border-border bg-background px-3 py-1.5 text-[10px] text-danger">
              Live updates are unavailable, so the count may be behind. Reload to check.
            </p>
          )}
          {error && <p className="border-b border-border px-3 py-1.5 text-[10px] text-danger">{error}</p>}
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              error ? null : <p className="px-3 py-4 text-center text-[11px] text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted">Nothing yet.</p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void go(item)}
                      disabled={opening !== null}
                      className="flex w-full gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-background disabled:cursor-wait"
                    >
                      <span
                        aria-label={item.read ? undefined : "Unread"}
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.read ? "" : "bg-accent"}`}
                      />
                      <Row item={item} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items !== null && items.length === INBOX_LIMIT && (
            <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted">The {INBOX_LIMIT} newest are shown.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ item }: { item: InboxItem }) {
  const { event } = item;
  const tone = item.read ? "text-muted" : "text-foreground";
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={`text-[11px] leading-snug ${tone}`}>
        {event.kind === "note" ? (
          <>
            <span className="font-semibold">{event.author}</span> left a note on a file you noted
          </>
        ) : event.kind === "run_complete" ? (
          <>Your map is ready</>
        ) : (
          <span className={item.read ? "" : "text-danger"}>Your run failed</span>
        )}
      </span>
      <span className="truncate font-mono text-[10px] text-muted" title={event.kind === "note" ? `${item.repo} · ${event.path}` : item.repo}>
        {item.repo}
        {event.kind === "note" ? ` · ${event.path}` : ` · ${versionName(event.version)}${event.branch ? ` · ${event.branch}` : ""}`}
      </span>
      {event.kind === "run_failed" && event.reason && <span className="line-clamp-2 text-[10px] leading-snug text-muted">{event.reason}</span>}
      {event.kind !== "note" && !event.kept && (
        <span className="text-[10px] text-muted">{versionName(event.version)} is no longer kept.</span>
      )}
      <span className="text-[10px] text-muted" title={item.at.exact}>
        {item.at.relative}
      </span>
    </span>
  );
}
