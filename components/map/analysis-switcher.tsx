"use client";

import Link from "next/link";
import { Menu, MENU_ROW, MenuHeading } from "@/components/menu";
import { KEPT_ANALYSES, versionName, type AnalysisStatus } from "@/lib/stages";
import { Icon } from "./icons";

export interface AnalysisOption {
  id: string;
  /** Where it opens: its repository and version. */
  path: string;
  /** Its number within the repository, which is what it is called. */
  version: number;
  /** Null only on a row from before commits were resolved up front that failed before reaching one. */
  commit: string | null;
  branch: string | null;
  status: AnalysisStatus;
  /** When it was asked for, already formatted on the server so both sides render the same text. */
  ran: string;
}

/**
 * Which of the repository's analyses the map is drawn from, opening onto the
 * others. An earlier one is marked as such in the header itself, so an old
 * map is never read as the current one.
 */
export function AnalysisSwitcher({
  current,
  latest,
  analyses,
}: {
  current: AnalysisOption;
  /** The latest finished analysis: the one the repository opens on. */
  latest: string | null;
  /** Newest first. */
  analyses: readonly AnalysisOption[];
}) {
  const earlier = current.id !== latest;
  // Said only while it is true: the next run to finish removes the oldest.
  const oldest = analyses.length >= KEPT_ANALYSES ? analyses.at(-1) : undefined;

  return (
    <Menu
      icon="branch"
      // The short commit is on the button itself; the tip adds what isn't, in words.
      tip={`${current.branch ? `On ${current.branch}, mapped` : "Mapped"} ${current.ran}. Click for other versions.`}
      label={
        // Branch and time are in the menu and the tooltip; the header keeps what
        // identifies the map. A link names one analysis, so the commit stays in view.
        <span className="flex items-center gap-1.5 font-mono">
          <span className="font-sans font-medium">{versionName(current.version)}</span>
          {current.commit && <span className="text-muted">· {current.commit.slice(0, 7)}</span>}
          {/* Shortened on narrow screens, never dropped: an old map must not read as the current one. */}
          {earlier && (
            <span className="rounded bg-background px-1 font-sans text-[10px] ring-1 ring-border">
              earlier<span className="hidden xl:inline"> analysis</span>
            </span>
          )}
        </span>
      }
    >
      {(close) => (
        <>
          <MenuHeading>
            Analyses of this repository <span className="font-mono tabular-nums">{analyses.length}</span>
          </MenuHeading>
          <div className="max-h-72 overflow-y-auto px-1 pb-1">
            {analyses.map((a) => (
              <Link key={a.id} href={a.path} onClick={close} className={`${MENU_ROW} text-[11px]`}>
                <span className="w-16 shrink-0 font-medium" title={a.commit ?? undefined}>
                  {versionName(a.version)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">{a.branch}</span>
                {/* Only a finished analysis has a map; the others open on their progress or failure. */}
                {a.status !== "complete" ? (
                  <span className={`shrink-0 text-[10px] ${a.status === "failed" ? "text-danger" : "text-muted"}`}>{a.status}</span>
                ) : (
                  a.id === latest && <span className="shrink-0 text-[10px] text-muted">latest</span>
                )}
                <span className="shrink-0 text-[10px] text-muted tabular-nums">{a.ran}</span>
                {a.id === current.id ? <Icon name="check" className="size-3.5 shrink-0 text-accent" /> : <span className="size-3.5 shrink-0" />}
              </Link>
            ))}
          </div>
          {oldest && (
            <p className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-muted">
              A repository keeps its {KEPT_ANALYSES} most recent analyses. The next one to finish removes the oldest,{" "}
              {versionName(oldest.version)} from {oldest.ran}.
            </p>
          )}
        </>
      )}
    </Menu>
  );
}
