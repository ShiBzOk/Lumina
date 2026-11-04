import Link from "next/link";
import { Icon } from "@/components/map/icons";
import { PetrolBand } from "@/components/petrol-band";
import { WorkspaceHeader } from "@/components/workspace-header";

// One message for both cases on purpose: the policy hides another
// organization's analysis exactly as if it didn't exist, and so does this.
export default function AnalysisNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="flex flex-1 flex-col">
        <PetrolBand
          header={
            <>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.2em] text-white/80 uppercase hover:text-white"
              >
                <Icon name="arrowLeft" className="size-3" />
                Repositories
              </Link>
              <h1 className="mt-4 text-3xl leading-[1.05] font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                Analysis not found
              </h1>
            </>
          }
        >
          <p className="px-4 py-4 text-[12px] leading-relaxed text-muted">
            This analysis doesn&apos;t exist, or it belongs to an organization you&apos;re not in. If someone sent you
            the link, check you&apos;ve switched to their organization.
          </p>
          <div className="flex justify-end border-t border-border bg-background px-4 py-2.5">
            <Link
              href="/"
              className="flex h-7 items-center rounded-lg bg-petrol px-3 text-[11px] font-medium text-white hover:bg-petrol/90"
            >
              Back to repositories
            </Link>
          </div>
        </PetrolBand>
      </main>
    </div>
  );
}
