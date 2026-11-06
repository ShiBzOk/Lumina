"use client";

import { useClerk, useOrganization, useOrganizationList } from "@clerk/nextjs";
import type { UserOrganizationInvitationResource } from "@clerk/nextjs/types";
import { useEffect, useState } from "react";
import { Icon } from "@/components/map/icons";
import { Menu, MENU_ROW, MenuFooter, MenuHeading } from "@/components/menu";
import { INVITATION_PARAM } from "@/lib/invitation-param";

/**
 * The active organization, drawn like the map's repository menu. Switching is
 * ours; creating, inviting and leaving still open Clerk's own dialogs.
 */
export function OrganizationSwitcher() {
  const clerk = useClerk();
  const { organization } = useOrganization();
  const { isLoaded, setActive, userMemberships, userInvitations } = useOrganizationList({
    userMemberships: { pageSize: 20, infinite: true },
    // The invitation email's link only joins someone who arrives signed out; a
    // signed-in user's invitation waits here, so this is where they accept it.
    userInvitations: { status: "pending", pageSize: 20 },
  });
  const [accepting, setAccepting] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Read once: the menu opens on arrival from an invitation email, not on every visit.
  // Safe to read the URL here because nothing renders until Clerk has loaded on the client.
  const [fromEmail] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has(INVITATION_PARAM),
  );
  useEffect(() => {
    if (!fromEmail) return;
    // Drop the flag so a reload doesn't reopen the menu.
    const url = new URL(window.location.href);
    url.searchParams.delete(INVITATION_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, [fromEmail]);
  // Nothing until Clerk knows, so the server's render and the first client render agree.
  if (!isLoaded || !organization) return null;

  const invitations = userInvitations.data ?? [];
  // Arrived from an email but this account holds no invitation: it went to another address.
  const sentElsewhere = fromEmail && !userInvitations.isLoading && invitations.length === 0;

  async function accept(invitation: UserOrganizationInvitationResource) {
    setAccepting(invitation.id);
    setFailed(null);
    try {
      await invitation.accept();
      // The session only lists memberships it has loaded, so it has to see the new one before it can switch to it.
      await clerk.user?.reload();
      await setActive?.({ organization: invitation.publicOrganizationData.id, redirectUrl: "/" });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Could not accept the invitation.");
      void userInvitations.revalidate?.();
    } finally {
      setAccepting(null);
    }
  }

  return (
    <Menu
      icon="building"
      defaultOpen={fromEmail}
      label={
        <>
          <span className="max-w-48 truncate text-xs">{organization.name}</span>
          {invitations.length > 0 && (
            <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">
              {invitations.length} {invitations.length === 1 ? "invitation" : "invitations"}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <>
          {invitations.length > 0 && (
            <>
              <MenuHeading>Invitations</MenuHeading>
              <div className="px-1 pb-1">
                {invitations.map((inv) => (
                  <div key={inv.id} className={`${MENU_ROW} text-xs`}>
                    <span className="min-w-0 flex-1 truncate">{inv.publicOrganizationData.name}</span>
                    <span className="shrink-0 text-[10px] text-muted">{inv.role.replace(/^org:/, "")}</span>
                    <button
                      type="button"
                      disabled={accepting !== null}
                      onClick={() => void accept(inv)}
                      className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-accent hover:bg-background disabled:opacity-50"
                    >
                      {accepting === inv.id ? "Joining…" : "Accept"}
                    </button>
                  </div>
                ))}
                {failed && <p className="px-2 py-1 text-[10px] text-muted">{failed}</p>}
              </div>
            </>
          )}
          {sentElsewhere && (
            <p className="px-3 pt-2.5 pb-1 text-[11px] text-muted">
              No invitation for this account. It was sent to another email; you&apos;re signed in as{" "}
              <span className="font-mono">{clerk.user?.primaryEmailAddress?.emailAddress ?? "an unknown address"}</span>.
            </p>
          )}
          <MenuHeading>Organizations</MenuHeading>
          <div className="max-h-72 overflow-y-auto px-1 pb-1">
            {userMemberships.data?.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  close();
                  // Every list on the page belongs to the organization, so start again from the top.
                  if (m.organization.id !== organization.id) void setActive({ organization: m.organization.id, redirectUrl: "/" });
                }}
                className={`${MENU_ROW} text-xs`}
              >
                <span className="min-w-0 flex-1 truncate">{m.organization.name}</span>
                <span className="shrink-0 text-[10px] text-muted">{m.role.replace(/^org:/, "")}</span>
                {m.organization.id === organization.id ? (
                  <Icon name="check" className="size-3.5 shrink-0 text-accent" />
                ) : (
                  <span className="size-3.5 shrink-0" />
                )}
              </button>
            ))}
            {userMemberships.hasNextPage && (
              <button type="button" onClick={() => userMemberships.fetchNext()} className={`${MENU_ROW} text-[11px] text-muted`}>
                Show more
              </button>
            )}
          </div>
          <MenuFooter>
            <button
              type="button"
              onClick={() => {
                close();
                clerk.openCreateOrganization({ afterCreateOrganizationUrl: "/" });
              }}
              className={`${MENU_ROW} text-xs`}
            >
              <Icon name="plus" className="size-3.5 text-muted" />
              Create organization
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                clerk.openOrganizationProfile({ afterLeaveOrganizationUrl: "/" });
              }}
              className={`${MENU_ROW} text-xs`}
            >
              <Icon name="users" className="size-3.5 text-muted" />
              Members and settings
            </button>
          </MenuFooter>
        </>
      )}
    </Menu>
  );
}
