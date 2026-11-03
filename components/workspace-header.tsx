import { OrganizationSwitcher } from "@clerk/nextjs";
import Link from "next/link";
import { AccountButton } from "@/components/account-button";

// The top bar of every signed-in screen except the map, which has its own.
export function WorkspaceHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-6">
      <Link href="/" className="text-[17px] font-semibold tracking-[-0.02em]">
        Lumina
      </Link>
      <span className="text-border" aria-hidden>
        /
      </span>
      {/* Switching, creating and inviting all come from Clerk's own UI. */}
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" afterLeaveOrganizationUrl="/" />
      <div className="flex-1" />
      <AccountButton />
    </header>
  );
}
