"use client";

import Link from "next/link";
import { Menu, MENU_ROW, MenuFooter, MenuHeading } from "@/components/menu";
import type { AnalysisStatus } from "@/lib/stages";
import { Icon } from "./icons";

export interface RepositoryOption {
  /** The analysis the repository opens on: the latest map, or a run still in progress. */
  id: string;
  /** Where that analysis opens. */
  path: string;
  repo: string;
  branch: string | null;
  status: AnalysisStatus;
}

/** The current repository, which opens onto the organization's others and a way to add one. */
export function RepoSwitcher({ repo, repositories }: { repo: string; repositories: readonly RepositoryOption[] }) {
  return (
    <Menu icon="repo" tip={`${repo} · switch repository`} label={<span className="min-w-0 truncate font-mono">{repo}</span>}>
      {(close) => (
        <>
          <MenuHeading>Repositories</MenuHeading>
          <div className="max-h-72 overflow-y-auto px-1 pb-1">
            {repositories.map((r) => (
              <Link key={r.id} href={r.path} onClick={close} className={`${MENU_ROW} font-mono text-[11px]`}>
                <span className="min-w-0 flex-1 truncate">{r.repo}</span>
                {r.branch && <span className="shrink-0 text-[10px] text-muted">{r.branch}</span>}
                {/* Only a finished analysis has a map; the others open on their progress. */}
                {r.status !== "complete" && <span className="shrink-0 text-[10px] text-muted">{r.status}</span>}
                {r.repo === repo ? <Icon name="check" className="size-3.5 shrink-0 text-accent" /> : <span className="size-3.5 shrink-0" />}
              </Link>
            ))}
          </div>
          <MenuFooter>
            <Link href="/?add" className={`${MENU_ROW} text-xs`}>
              <Icon name="plus" className="size-3.5 text-muted" />
              Add repository
            </Link>
            <Link href="/" className={`${MENU_ROW} text-xs`}>
              <Icon name="layers" className="size-3.5 text-muted" />
              All repositories
            </Link>
          </MenuFooter>
        </>
      )}
    </Menu>
  );
}
