import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

// The shell every signed-in screen renders inside: one top bar, content below.
export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <span className="text-[17px] font-semibold tracking-[-0.02em]">
          Lumina
        </span>
        <span className="text-border" aria-hidden>
          /
        </span>
        {/* Switching, creating and inviting all come from Clerk's own UI. */}
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
        />
        <div className="flex-1" />
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
