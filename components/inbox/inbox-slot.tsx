import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { unreadCount } from "@/lib/notifications";
import { Inbox } from "./inbox";

async function Loaded() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return null;
  const unread = await unreadCount();
  // Keyed by organization, so switching starts a fresh inbox on the new
  // organization's channel instead of carrying the old one's count over.
  return <Inbox key={orgId} topic={`notifications:${orgId}:${userId}`} initial={unread} />;
}

/** The inbox beside the account, with its count read on the server so the header renders whole. */
export function InboxSlot() {
  return (
    <Suspense fallback={null}>
      <Loaded />
    </Suspense>
  );
}
