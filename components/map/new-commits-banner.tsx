"use client";

import Link from "next/link";
import { RemapButton, useHeadCheck } from "@/components/new-commits";
import { versionName } from "@/lib/stages";
import { Icon } from "./icons";

// Checked when the map opens, so a map drawn from an older commit says so
// before anything on it is read or explained. Silent while asking and when
// the branch hasn't moved. An analysis asked for by commit follows no branch,
// so it is never checked.
export function NewCommitsBanner({
  analysisId,
  branch,
  commit,
  version,
  analysed,
}: {
  analysisId: string;
  branch: string | null;
  commit: string;
  /** This map's version, which is what it is called. */
  version: number;
  /** The repository's analyses by commit, so a tip already analysed is opened rather than re-mapped. */
  analysed: ReadonlyMap<string, { id: string; version: number }>;
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
            <span className="font-mono">{branch}</span> has{" "}
            <span title={`now at ${check.head}`}>new commits</span> since{" "}
            <span title={commit}>{versionName(version)}</span>
            {existing ? <>. Its latest commit is already mapped as {versionName(existing.version)}.</> : " was mapped."}
          </span>
          {existing ? (
            <Link
              href={`/analyses/${existing.id}`}
              className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 font-medium text-white hover:bg-accent/90"
            >
              Open {versionName(existing.version)}
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
