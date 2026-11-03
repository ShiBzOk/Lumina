"use client";

import { useClerk, useOrganization, useOrganizationList } from "@clerk/nextjs";
import { Icon } from "@/components/map/icons";
import { Menu, MENU_ROW, MenuFooter, MenuHeading } from "@/components/menu";

/**
 * The active organization, drawn like the map's repository menu. Switching is
 * ours; creating, inviting and leaving still open Clerk's own dialogs.
 */
export function OrganizationSwitcher() {
  const clerk = useClerk();
  const { organization } = useOrganization();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({ userMemberships: { pageSize: 20, infinite: true } });
  // Nothing until Clerk knows, so the server's render and the first client render agree.
  if (!isLoaded || !organization) return null;

  return (
    <Menu icon="building" label={<span className="max-w-48 truncate text-xs">{organization.name}</span>}>
      {(close) => (
        <>
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
