"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AccountButton } from "@/components/account-button";
import { Logo } from "@/components/logo";
import { explain } from "@/app/analyses/actions";
import { frameworkOf, MODEL_CATEGORIES, type ModelRole } from "@/lib/map/frameworks";
import { highlight, isFiltering, matches, NO_FILTER, sameSelection, type Filter, type Selection } from "@/lib/map/highlight";
import { adjacency } from "@/lib/map/graph";
import { findInsights } from "@/lib/map/insights";
import { buildMap, fileTypeOf } from "@/lib/map/model";
import { summarize } from "@/lib/map/summary";
import type { Coverage, Edge, ImportRecord, RepoFile, Route, WithheldRoute } from "@/parser/types";
import { Canvas, type CanvasHandle } from "./canvas";
import { CategoryRail } from "./category-rail";
import { CoverageBanner } from "./coverage-banner";
import { NewCommitsBanner } from "./new-commits-banner";
import { DetailPane, type PaneTab } from "./detail-pane";
import { Drawer } from "./drawer";
import { explainKey, type ExplainState } from "./explanation";
import { Icon } from "./icons";
import { FileSearch } from "./file-search";
import { RepoSwitcher, type RepositoryOption } from "./repo-switcher";

interface MapWorkspaceProps {
  meta: { analysisId: string; repo: string; branch: string; commit: string };
  /** The organization's analyses, for switching between them. */
  repositories: RepositoryOption[];
  adapter: string;
  files: RepoFile[];
  edges: Edge[];
  imports: ImportRecord[];
  routes: Route[];
  routesWithheld: WithheldRoute[];
  coverage: Coverage;
  labels: { path: string; role: ModelRole }[];
}

// The shell: header across the top, categories on the left, the canvas in the
// middle, details on the right. Later phases add to these panels, not move them.
export function MapWorkspace({ meta, repositories, adapter, files, edges, imports, routes, routesWithheld, coverage, labels }: MapWorkspaceProps) {
  const modelRoles = useMemo(() => new Map(labels.map((l) => [l.path, l.role])), [labels]);
  const map = useMemo(() => buildMap(files, edges, modelRoles), [files, edges, modelRoles]);
  const [selection, setSelection] = useState<Selection>(null);
  // What the pointer is over, on the map or in the pane; each lights it in the other.
  const [hovered, setHovered] = useState<Selection>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [railOpen, setRailOpen] = useState(true);
  const [paneOpen, setPaneOpen] = useState(true);
  const [tab, setTab] = useState<PaneTab>("structure");
  // Lives here so it stays shut until asked, however often the pane redraws.
  const [insightsOpen, setInsightsOpen] = useState(false);
  const canvas = useRef<CanvasHandle>(null);
  // Every explanation fetched this visit, by subject, so coming back to one shows it without asking again.
  const [explanations, setExplanations] = useState<ReadonlyMap<string, ExplainState>>(new Map());
  const runExplain = useCallback(
    async (subject: NonNullable<Selection>) => {
      const key = explainKey(subject);
      const set = (state: ExplainState) => setExplanations((prev) => new Map(prev).set(key, state));
      set({ status: "loading", since: Date.now() });
      try {
        const result = await explain(meta.analysisId, subject);
        set(result.ok ? { status: "done", ...result } : { status: "error", message: result.error });
      } catch (error) {
        set({ status: "error", message: error instanceof Error ? error.message : "The request failed" });
      }
    },
    [meta.analysisId],
  );

  const lit = useMemo(() => highlight(map, selection), [map, selection]);
  const summary = useMemo(() => summarize(files, imports), [files, imports]);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const importsOf = useMemo(
    () =>
      Map.groupBy(
        imports.toSorted((a, b) => a.line - b.line),
        (r) => r.from,
      ),
    [imports],
  );
  const graph = useMemo(() => adjacency(edges), [edges]);
  const insights = useMemo(() => findInsights(files, edges, adapter), [files, edges, adapter]);

  const types = useMemo(() => new Set(files.map((f) => fileTypeOf(f.path))), [files]);
  const framework = frameworkOf(adapter);
  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) if (f.role !== null) counts.set(f.role, (counts.get(f.role) ?? 0) + 1);
    return counts;
  }, [files]);
  const modelRoleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of labels) counts.set(l.role, (counts.get(l.role) ?? 0) + 1);
    return counts;
  }, [labels]);
  const filtering = isFiltering(filter);
  const matchingCount = useMemo(
    () => (filtering ? map.nodes.reduce((n, node) => n + node.files.filter((f) => matches(f, filter)).length, 0) : files.length),
    [filtering, map, filter, files.length],
  );

  // Selecting from the pane or search also brings the card into view, which
  // only ever happens because that click asked for it.
  const select = useCallback((next: Selection) => {
    setSelection(next);
    // The row under the pointer may be gone after the pane redraws, and never say so.
    setHovered(null);
    if (next) setPaneOpen(true);
  }, []);
  const hover = useCallback((next: Selection) => setHovered((prev) => (sameSelection(prev, next) ? prev : next)), []);
  const selectAndReveal = useCallback(
    (next: Selection) => {
      select(next);
      const id = next?.kind === "node" ? next.id : next?.kind === "file" ? map.nodeOf.get(next.path) : undefined;
      if (id) canvas.current?.reveal(id, next?.kind === "file" ? next.path : undefined);
    },
    [select, map],
  );

  const filterName = [
    framework?.categories.find((c) => c.role === filter.role)?.label,
    MODEL_CATEGORIES.find((c) => c.role === filter.modelRole)?.label,
    filter.hiddenTypes.size > 0 ? `${filter.hiddenTypes.size} type${filter.hiddenTypes.size > 1 ? "s" : ""} hidden` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Logo />
        <span className="h-5 w-px bg-border" aria-hidden />
        <RepoSwitcher current={meta.analysisId} repo={meta.repo} branch={meta.branch} repositories={repositories} />

        <div className="flex flex-1 items-center justify-center gap-2 font-mono text-[11px] text-muted">
          <Icon name="branch" className="size-3.5" />
          <span className="text-foreground">{meta.branch}</span>
          <span title={meta.commit}>{meta.commit.slice(0, 7)}</span>·<span>{files.length} files</span>·
          <span>{edges.length} dependency links</span>
        </div>

        <FileSearch nodes={map.nodes} onPick={selectAndReveal} />
        <AccountButton />
      </header>

      <NewCommitsBanner analysisId={meta.analysisId} branch={meta.branch} commit={meta.commit} />
      <CoverageBanner coverage={coverage} />

      <div className="flex min-h-0 flex-1">
        <Drawer open={railOpen} side="left" width="15rem">
          <CategoryRail
            total={files.length}
            framework={framework}
            roleCounts={roleCounts}
            modelRoleCounts={modelRoleCounts}
            types={types}
            filter={filter}
            onFilter={setFilter}
            onCollapse={() => setRailOpen(false)}
          />
        </Drawer>

        <Canvas
          ref={canvas}
          map={map}
          selection={selection}
          highlight={lit}
          hovered={hovered}
          filter={filter}
          onSelect={select}
          onHover={hover}
          banner={
            <div className="flex items-center gap-2 rounded-full bg-surface/95 px-3.5 py-1.5 text-[11px] whitespace-nowrap text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border">
              {filtering ? (
                <>
                  <span>
                    Filtering: <span className="font-mono font-medium text-foreground">{filterName}</span>
                  </span>
                  <span className="font-mono">· {matchingCount} files</span>
                  <button
                    type="button"
                    onClick={() => setFilter(NO_FILTER)}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <Icon name="layers" className="size-3.5" />
                  <span>
                    {map.nodes.length} folders from {files.length} files · click a card or file to trace its connections
                  </span>
                </>
              )}
            </div>
          }
        >
          {/* Each fades in as its panel finishes leaving, where the panel went. */}
          {!railOpen && (
            <button
              data-overlay
              type="button"
              title="Show categories"
              onClick={() => setRailOpen(true)}
              className="absolute top-3 left-3 flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border transition-[opacity,scale] delay-200 duration-200 ease-out hover:text-foreground starting:scale-90 starting:opacity-0"
            >
              <Icon name="layers" className="size-4" />
            </button>
          )}
          {!paneOpen && (
            <button
              data-overlay
              type="button"
              title="Show details"
              onClick={() => setPaneOpen(true)}
              className="absolute top-32 right-3 flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border transition-[opacity,scale] delay-200 duration-200 ease-out hover:text-foreground starting:scale-90 starting:opacity-0"
            >
              <Icon name="network" className="size-4" />
            </button>
          )}
        </Canvas>

        <Drawer open={paneOpen} side="right" width="19rem">
          <DetailPane
            map={map}
            repo={meta.repo}
            framework={framework}
            routes={routes}
            routesWithheld={routesWithheld}
            summary={summary}
            selection={selection}
            hovered={hovered}
            files={byPath}
            modelRoles={modelRoles}
            explanations={explanations}
            onExplain={runExplain}
            importsOf={importsOf}
            graph={graph}
            insights={insights}
            insightsOpen={insightsOpen}
            onInsightsOpen={setInsightsOpen}
            tab={tab}
            onTab={setTab}
            onSelect={selectAndReveal}
            onHover={hover}
            onCollapse={() => setPaneOpen(false)}
          />
        </Drawer>
      </div>
    </div>
  );
}
