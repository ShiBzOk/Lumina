"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountButton } from "@/components/account-button";
import { Logo } from "@/components/logo";
import { explain, loadCompareSide } from "@/app/analyses/actions";
import { compareAnalyses, type ComparedAnalysis } from "@/lib/map/compare";
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
import { AnalysisSwitcher, type AnalysisOption } from "./analysis-switcher";
import { ComparePane, type CompareState } from "./compare-pane";
import type { FileMark } from "./node-card";

interface MapWorkspaceProps {
  meta: { analysisId: string; repo: string; branch: string | null; commit: string };
  /** The organization's repositories, for switching between them. */
  repositories: RepositoryOption[];
  /** This repository's analyses, newest first, this one among them. */
  analyses: AnalysisOption[];
  /** The latest finished analysis of this repository. */
  latest: string | null;
  adapter: string;
  files: RepoFile[];
  edges: Edge[];
  imports: ImportRecord[];
  routes: Route[];
  routesWithheld: WithheldRoute[];
  coverage: Coverage;
  labels: { path: string; role: ModelRole }[];
  /** A base to open Compare against, from the address; ignored unless it is one of this repository's finished analyses. */
  compareBase: string | null;
}

/** A compared base as it arrives: asked for once, then kept for the visit. */
type SideState = { status: "error"; message: string } | { status: "done"; side: ComparedAnalysis };

function compareUrl(analysisId: string, base: string | null) {
  return base === null ? `/analyses/${analysisId}` : `/analyses/${analysisId}?compare=${base}`;
}

// The shell: header across the top, categories on the left, the canvas in the
// middle, details on the right. Later phases add to these panels, not move them.
export function MapWorkspace({
  meta,
  repositories,
  analyses,
  latest,
  adapter,
  files,
  edges,
  imports,
  routes,
  routesWithheld,
  coverage,
  labels,
  compareBase,
}: MapWorkspaceProps) {
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

  // Compare is a mode of the whole right-hand pane. The head is always the
  // analysis on screen; choosing another head goes to that analysis's map.
  // The choice is held against the analysis it was made on, so arriving at
  // another one starts from that page's address instead of carrying it over.
  const router = useRouter();
  const finished = useMemo(() => analyses.filter((a) => a.status === "complete"), [analyses]);
  const [compareChoice, setCompareChoice] = useState<{ head: string; base: string | null } | null>(null);
  const fromAddress = compareBase !== null && finished.some((a) => a.id === compareBase) ? compareBase : null;
  // With one finished map the only pair is that map against itself, so Compare waits for a second.
  const canCompare = finished.length > 1;
  const base = !canCompare ? null : compareChoice?.head === meta.analysisId ? compareChoice.base : fromAddress;
  const chooseBase = useCallback(
    (next: string | null) => {
      setCompareChoice({ head: meta.analysisId, base: next });
      // Kept in the address so a reload lands back here; no request, no navigation.
      window.history.replaceState(null, "", compareUrl(meta.analysisId, next));
    },
    [meta.analysisId],
  );
  const toggleCompare = () => {
    if (base !== null) return chooseBase(null);
    // The one before this, against this. With nothing earlier, this against itself, which says so.
    const at = finished.findIndex((a) => a.id === meta.analysisId);
    chooseBase(finished[at + 1]?.id ?? meta.analysisId);
    setPaneOpen(true);
  };
  const chooseHead = (head: string) => {
    if (head !== meta.analysisId && base !== null) router.push(compareUrl(head, base));
  };

  const [sides, setSides] = useState<ReadonlyMap<string, SideState>>(new Map());
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (base === null || base === meta.analysisId || asked.current.has(base)) return;
    asked.current.add(base);
    const set = (state: SideState) => setSides((prev) => new Map(prev).set(base, state));
    // A failure may be asked again by choosing it again; a success is kept.
    loadCompareSide(meta.analysisId, base).then(
      (r) => {
        if (!r.ok) asked.current.delete(base);
        set(r.ok ? { status: "done", side: r.side } : { status: "error", message: r.error });
      },
      (error: unknown) => {
        asked.current.delete(base);
        set({ status: "error", message: error instanceof Error ? error.message : "The request failed" });
      },
    );
  }, [base, meta.analysisId]);

  const headSide = useMemo<ComparedAnalysis>(() => ({ adapter, files, edges, coverage }), [adapter, files, edges, coverage]);
  const baseSide = base === null ? undefined : sides.get(base);
  const comparison = useMemo(
    () => (base !== null && base !== meta.analysisId && baseSide?.status === "done" ? compareAnalyses(baseSide.side, headSide) : null),
    [base, meta.analysisId, baseSide, headSide],
  );
  const compareState: CompareState = comparison
    ? { status: "done", comparison }
    : baseSide?.status === "error"
      ? { status: "error", message: baseSide.message }
      : { status: "loading" };
  const marks = useMemo(() => {
    if (!comparison) return null;
    const m = new Map<string, FileMark>();
    for (const p of comparison.filesAdded) m.set(p, "added");
    for (const p of comparison.contentChanged) m.set(p, "changed");
    return m;
  }, [comparison]);
  const headPaths = useMemo(() => new Set(files.map((f) => f.path)), [files]);
  // Moves the map without touching the selection, so leaving Compare returns to it.
  const reveal = useCallback(
    (path: string) => {
      const id = map.nodeOf.get(path);
      if (id) canvas.current?.reveal(id, path);
    },
    [map],
  );

  const lit = useMemo(() => highlight(map, selection), [map, selection]);
  const analysed = useMemo(() => new Map(analyses.flatMap((a) => (a.commit ? [[a.commit, { id: a.id, version: a.version }] as const] : []))), [analyses]);
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

  // Hooks are all above: this is the first place the render may stop.
  const current = analyses.find((a) => a.id === meta.analysisId);
  if (!current) throw new Error(`Analysis ${meta.analysisId} is not among its repository's analyses`);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Logo />
        <span className="h-5 w-px bg-border" aria-hidden />
        <RepoSwitcher repo={meta.repo} repositories={repositories} />
        <AnalysisSwitcher current={current} latest={latest} analyses={analyses} />
        {canCompare && (
        <button
          type="button"
          aria-pressed={base !== null}
          onClick={toggleCompare}
          title={base !== null ? "Leave Compare" : "Compare with another analysis of this repository"}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
            base !== null ? "border-accent/50 bg-accent/8 text-accent" : "border-border hover:bg-background"
          }`}
        >
          Compare
        </button>
        )}

        <div className="flex flex-1 items-center justify-center gap-2 font-mono text-[11px] text-muted">
          <span>{files.length} files</span>·<span>{edges.length} dependency links</span>
        </div>

        <FileSearch nodes={map.nodes} onPick={selectAndReveal} />
        <AccountButton />
      </header>

      <NewCommitsBanner analysisId={meta.analysisId} branch={meta.branch} commit={meta.commit} version={current.version} analysed={analysed} />
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
          marks={marks}
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
          {base !== null ? (
            <ComparePane
              analyses={finished}
              base={base}
              head={meta.analysisId}
              state={compareState}
              inHead={headPaths}
              hovered={hovered}
              onBase={chooseBase}
              onHead={chooseHead}
              onReveal={reveal}
              onHover={hover}
              onExit={() => chooseBase(null)}
              onCollapse={() => setPaneOpen(false)}
            />
          ) : (
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
          )}
        </Drawer>
      </div>
    </div>
  );
}
