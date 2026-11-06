"use client";

import { RemapButton, useHeadCheck } from "@/components/new-commits";
import { Icon } from "./icons";

// Checked when the map opens, so a map drawn from an older commit says so
// before anything on it is read or explained. Silent while asking and when
// the branch hasn't moved.
export function NewCommitsBanner({ analysisId, branch, commit }: { analysisId: string; branch: string; commit: string }) {
  const check = useHeadCheck(analysisId, true);
  if (!check || check.state === "current") return null;

  return (
    <section className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-4 py-1.5 text-[11px]">
      <Icon name="alert" className="size-3.5 shrink-0 text-muted" />
      {check.state === "moved" ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="font-mono">{branch}</span> has new commits. This map is of{" "}
            <span className="font-mono" title={commit}>
              {commit.slice(0, 7)}
            </span>
            ; the branch is now at{" "}
            <span className="font-mono" title={check.head}>
              {check.head.slice(0, 7)}
            </span>
            .
          </span>
          <RemapButton analysisId={analysisId} className="h-6 rounded-md bg-accent px-2.5 font-medium text-white hover:bg-accent/90" />
        </>
      ) : (
        <span className="min-w-0 flex-1 text-muted">
          Couldn&apos;t check <span className="font-mono">{branch}</span> for new commits: {check.reason}
        </span>
      )}
    </section>
  );
}
