import { AccountButton } from "@/components/account-button";
import { Logo } from "@/components/logo";
import { OrganizationSwitcher } from "@/components/organization-switcher";

// The top bar of every signed-in screen except the map, which has its own.
export function WorkspaceHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <Logo />
      <span className="h-5 w-px bg-border" aria-hidden />
      <OrganizationSwitcher />
      <div className="flex-1" />
      <AccountButton />
    </header>
  );
}
