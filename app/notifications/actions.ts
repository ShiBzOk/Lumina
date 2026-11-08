"use server";

import type { InboxItem } from "@/lib/inbox";
import * as notifications from "@/lib/notifications";

// Every result is returned rather than thrown: a thrown message is hidden in
// production, and these are the person's to read.

function failed(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export type CountResult = { ok: true; unread: number } | { ok: false; error: string };

/** Asked once the live channel is joined and on every ping from it, never on a timer. */
export async function unreadNotifications(): Promise<CountResult> {
  try {
    return { ok: true, unread: await notifications.unreadCount() };
  } catch (error) {
    return failed(error);
  }
}

export type InboxResult = { ok: true; items: InboxItem[] } | { ok: false; error: string };

/** Read when the inbox is opened, and only then. */
export async function readInbox(): Promise<InboxResult> {
  try {
    return { ok: true, items: await notifications.listInbox() };
  } catch (error) {
    return failed(error);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openNotification(id: string): Promise<notifications.Opened> {
  if (!UUID.test(id)) return { ok: false, error: "That notification is gone." };
  try {
    return await notifications.openNotification(id);
  } catch (error) {
    return failed(error);
  }
}

export async function markAllNotificationsRead(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await notifications.markAllRead();
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}
