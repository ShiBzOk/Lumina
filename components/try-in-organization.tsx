"use client";

import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import { useState } from "react";
import { Icon } from "@/components/map/icons";

/**
 * On a missing analysis, the person's other organizations, each a way to try
 * the same address there. Nothing here knows which one owns it: the policy
 * hides that from everyone outside, so this only offers what the person is
 * already a member of, and the page that reloads decides.
 */
export function TryInOrganization() {
  const { organization } = useOrganization();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({ userMemberships: { pageSize: 20 } });
  const [switching, setSwitching] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Nothing until Clerk knows, so the server's render and the first client render agree.
  if (!isLoaded || !organization) return null;

  const others = (userMemberships.data ?? []).filter((m) => m.organization.id !== organization.id);
  if (others.length === 0) return null;

  return (
    <div className="border-t border-border px-4 py-3">
      <p className="mb-2 text-[11px] text-muted">
        You&apos;re looking in <span className="text-foreground">{organization.name}</span>. If the link came from one of your other
        organizations, open it there:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {others.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={switching !== null}
            onClick={async () => {
              setSwitching(m.organization.id);
              setFailed(null);
              try {
                await setActive({ organization: m.organization.id });
                // A full reload, not a client navigation: the address is the one already
                // open, which the router treats as going nowhere, and the server has to
                // read the analysis again under the new organization's token.
                window.location.reload();
              } catch (e) {
                setFailed(e instanceof Error ? e.message : "Couldn't switch organization.");
                setSwitching(null);
              }
            }}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] hover:bg-background disabled:opacity-50"
          >
            <Icon name="building" className="size-3 text-muted" />
            {switching === m.organization.id ? "Switching…" : `Try in ${m.organization.name}`}
          </button>
        ))}
      </div>
      {failed && <p className="mt-2 text-[11px] text-danger">{failed}</p>}
    </div>
  );
}
