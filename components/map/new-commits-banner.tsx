"use client";

import Link from "next/link";
import { RemapButton, useHeadCheck } from "@/components/new-commits";
import { Icon } from "./icons";

// Checked when the map opens, so a map drawn from an older commit says so
// before anything on it is read or explained. Silent while asking and when
// the branch hasn't moved. An analysis asked for by commit follows no branch,
// so it is never checked.
export function NewCommitsBanner({
  analysisId,
  branch,
  commit,
  analysed,
}: {
  analysisId: string;
  branch: string | null;
  commit: string;
  /** The repository's analyses by commit, so a tip already analysed is opened rather than re-mapped. */
  analysed: ReadonlyMap<string, string>;
}) {
  const check = useHeadCheck(analysisId, branch !== null);
  if (!branch || !check || check.state === "current") return null;
  const existing = check.state === "moved" ? analysed.get(check.head) : undefined;

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
            {existing ? ", which is already mapped." : "."}
          </span>
          {existing ? (
            <Link
              href={`/analyses/${existing}`}
              className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 font-medium text-white hover:bg-accent/90"
            >
              Open {check.head.slice(0, 7)}
              <Icon name="arrowRight" className="size-3" />
            </Link>
          ) : (
            <RemapButton analysisId={analysisId} className="h-6 rounded-md bg-accent px-2.5 font-medium text-white hover:bg-accent/90" />
          )}
        </>
      ) : (
        <span className="min-w-0 flex-1 text-muted">
          Couldn&apos;t check <span className="font-mono">{branch}</span> for new commits: {check.reason}
        </span>
      )}
    </section>
  );
}
