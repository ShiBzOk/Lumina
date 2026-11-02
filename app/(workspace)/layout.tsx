import { WorkspaceHeader } from "@/components/workspace-header";

// The shell every signed-in screen renders inside: one top bar, content below.
export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
