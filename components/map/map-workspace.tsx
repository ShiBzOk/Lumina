"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AccountButton } from "@/components/account-button";
import { Logo } from "@/components/logo";
import { addNote, deleteNote, editNote, explain, loadCompareSide, recordVisit, type NotesResult } from "@/app/analyses/actions";
import { notedPaths, type Note } from "@/lib/map/notes";
import { compareAnalyses, type ComparedAnalysis } from "@/lib/map/compare";
import { frameworkOf, MODEL_CATEGORIES, type ModelRole } from "@/lib/map/frameworks";
import { highlight, isFiltering, matches, NO_FILTER, sameSelection, type Filter, type Selection } from "@/lib/map/highlight";
import { adjacency } from "@/lib/map/graph";
import { findInsights } from "@/lib/map/insights";
import { MAX_VISIBLE_ROWS } from "@/lib/map/layout";
import { buildMap, fileTypeOf } from "@/lib/map/model";
import { DEFAULT_VIEW, readView, writeView, type Address, type View } from "@/lib/map/view";
import { summarize } from "@/lib/map/summary";
import type { Attribution } from "@/lib/when";
import type { Coverage, Edge, ImportRecord, RepoFile, Route, WithheldRoute } from "@/parser/types";
import { Canvas, type CanvasHandle } from "./canvas";
import { CategoryRail } from "./category-rail";
import { CoverageBanner } from "./coverage-banner";
import { NewCommitsBanner } from "./new-commits-banner";
import { DetailPane, type PaneTab, type WalkState } from "./detail-pane";
import { Drawer } from "./drawer";
import { explainKey, type ExplainState } from "./explanation";
import { Icon } from "./icons";
import { FileSearch } from "./file-search";
import { RepoSwitcher, type RepositoryOption } from "./repo-switcher";
import { AnalysisSwitcher, type AnalysisOption } from "./analysis-switcher";
import { CompareHint } from "./compare-hint";
import { ComparePane, type CompareState } from "./compare-pane";
import type { FileMark } from "./node-card";
import { CopyLink } from "./copy-link";
import { MissingFromLink } from "./missing-from-link";
import type { NoteActions } from "./notes";
import { Tour } from "./tour";

interface MapWorkspaceProps {
  meta: { analysisId: string; projectId: string; repo: string; branch: string | null; commit: string; attribution: Attribution };
  /** The organization's repositories, for switching between them. */
  repositories: RepositoryOption[];
  /** This repository's analyses, newest first, this one among them. */
  analyses: AnalysisOption[];
  /** The map the repository opens on: its default branch's newest, or with none, the newest of any branch. */
  latest: string | null;
  /** As GitHub said at the last fetch; null for a repository not fetched since this was recorded. */
  defaultBranch: string | null;
  adapter: string;
  files: RepoFile[];
  edges: Edge[];
  imports: ImportRecord[];
  routes: Route[];
  routesWithheld: WithheldRoute[];
  coverage: Coverage;
  labels: { path: string; role: ModelRole }[];
  /** The repository's notes as they were when the map opened, newest first. */
  notes: Note[];
  /** The person looking, so their own notes can be edited. The database decides whether they may. */
  me: string;
  /** The page's search params: the view to open on. Read once; after that the view writes the address. */
  address: Address;
  /** The inbox beside the account, rendered on the server with its count. */
  inbox: ReactNode;
}

/** A compared base as it arrives: asked for once, then kept for the visit. */
type SideState = { status: "error"; message: string } | { status: "done"; side: ComparedAnalysis };

// The shell: header across the top, categories on the left, the canvas in the
// middle, details on the right. Later phases add to these panels, not move them.
export function MapWorkspace({
  meta,
  repositories,
  analyses,
  latest,
  defaultBranch,
  adapter,
  files,
  edges,
  imports,
  routes,
  routesWithheld,
  coverage,
  labels,
  notes: initialNotes,
  me,
  address,
  inbox,
}: MapWorkspaceProps) {
  // Opening a map is a visit to its repository: one write, when it opens, and
  // none for anything done on it after. The page keys this component by
  // analysis, so switching to another version is another open. The ref holds
  // through development's double-run of effects, which would otherwise write twice.
  const visited = useRef(false);
  useEffect(() => {
    if (visited.current) return;
    visited.current = true;
    void recordVisit(meta.projectId);
  }, [meta.projectId]);

  const modelRoles = useMemo(() => new Map(labels.map((l) => [l.path, l.role])), [labels]);
  const map = useMemo(() => buildMap(files, edges, modelRoles), [files, edges, modelRoles]);
  const finished = useMemo(() => analyses.filter((a) => a.status === "complete"), [analyses]);
  // With one finished map the only pair is that map against itself, so Compare waits for a second.
  const canCompare = finished.length > 1;
  // The view the address names, checked against this analysis once. Server
  // and browser read it from the same inputs, so both render the same. The
  // page keys this component by analysis, so another analysis reads its own.
  const [restored] = useState(() =>
    readView(address, {
      files: new Set(files.map((f) => f.path)),
      folders: new Map(map.nodes.map((n) => [n.id, Math.max(0, n.files.length - MAX_VISIBLE_ROWS)])),
      comparable: new Set(canCompare ? finished.map((a) => a.id) : []),
    }),
  );
  // Someone arriving at a named file came for that file. Read once, because the
  // address changes with every click after this.
  const [plainOpen] = useState(() => Object.keys(address).length === 0);
  const [missing, setMissing] = useState(restored.missing);
  const [selection, setSelection] = useState<Selection>(restored.view.selection);
  // What the pointer is over, on the map or in the pane; each lights it in the other.
  const [hovered, setHovered] = useState<Selection>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [railOpen, setRailOpen] = useState(true);
  const [paneOpen, setPaneOpen] = useState(true);
  const [tab, setTab] = useState<PaneTab>(restored.view.tab);
  const [walk, setWalk] = useState<WalkState>({ direction: restored.view.walk, depth: restored.view.depth });
  const [cards, setCards] = useState({ compact: restored.view.compact, offsets: restored.view.scroll });
  const onCardsView = useCallback((compact: boolean, offsets: ReadonlyMap<string, number>) => setCards({ compact, offsets }), []);
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

  // Notes are read when the map opens and replaced by whatever a write of
  // your own returns. Nothing refreshes them in between.
  const [notes, setNotes] = useState(initialNotes);
  const noted = useMemo(() => notedPaths(notes), [notes]);
  const noteActions = useMemo<NoteActions>(() => {
    const keep = (result: NotesResult) => {
      if (result.ok) setNotes(result.notes);
      return result;
    };
    return {
      add: (path, body) => addNote(meta.analysisId, path, body).then(keep),
      edit: (id, body) => editNote(meta.analysisId, id, body).then(keep),
      remove: (id) => deleteNote(meta.analysisId, id).then(keep),
    };
  }, [meta.analysisId]);

  // Compare is a mode of the whole right-hand pane. The head is always the
  // analysis on screen; choosing another head goes to that analysis's map.
  // Base and head are never the same analysis: comparing one with itself says
  // nothing, so every way of choosing either side steers around it.
  const router = useRouter();
  // A link naming this analysis as its own base opens without Compare.
  const [base, setBase] = useState<string | null>(restored.view.compare === meta.analysisId ? null : restored.view.compare);
  const openCompare = (head: string, against: string) =>
    router.push(`${analyses.find((a) => a.id === head)?.path ?? `/analyses/${head}`}${writeView({ ...DEFAULT_VIEW, compare: against })}`);
  // Started from the version menu. A comparison always reads older → newer:
  // an older choice becomes the base here, a newer one opens its own map with
  // this one as the base.
  const compareWith = (id: string | null) => {
    if (id === null) return setBase(null);
    const other = finished.find((a) => a.id === id);
    const self = finished.find((a) => a.id === meta.analysisId);
    if (!other || !self || id === meta.analysisId) return;
    if (other.version > self.version) return openCompare(id, meta.analysisId);
    setBase(id);
    setPaneOpen(true);
  };
  const chooseBase = (id: string) => {
    if (id !== meta.analysisId) setBase(id);
  };
  // Choosing the base as the head swaps the two, which is also what the swap button does.
  const chooseHead = (head: string) => {
    if (head !== meta.analysisId && base !== null) openCompare(head, head === base ? meta.analysisId : base);
  };

  // This analysis's own address; the view goes after it.
  const here = analyses.find((a) => a.id === meta.analysisId)?.path ?? `/analyses/${meta.analysisId}`;
  // The address follows the view, replacing its history entry rather than
  // adding one, so Back leaves the map instead of stepping through clicks.
  const view = useMemo<View>(
    () => ({ selection, tab, walk: walk.direction, depth: walk.depth, compact: cards.compact, scroll: cards.offsets, compare: base }),
    [selection, tab, walk, cards, base],
  );
  useEffect(() => {
    const next = `${here}${writeView(view)}`;
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, "", next);
  }, [view, here]);

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
  const analysed = useMemo(() => new Map(analyses.flatMap((a) => (a.commit ? [[a.commit, { id: a.id, path: a.path, version: a.version }] as const] : []))), [analyses]);
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
        {/* Where you are on the left, as a breadcrumb; what you can do on the right.
            Only the repository name gives way when the header narrows. */}
        <div className="shrink-0">
          <Logo />
        </div>
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
        <div className="flex min-w-0 items-center gap-1">
          <RepoSwitcher repo={meta.repo} repositories={repositories} />
          <Icon name="chevronRight" className="size-3 shrink-0 text-muted" />
          <div className="shrink-0" data-tour="versions">
            <AnalysisSwitcher
              current={current}
              latest={latest}
              defaultBranch={defaultBranch}
              analyses={analyses}
              attribution={meta.attribution}
              base={base}
              onCompare={compareWith}
            />
          </div>
        </div>

        <div className="flex flex-1 shrink-0 items-center justify-end gap-2">
          <FileSearch nodes={map.nodes} noted={noted} onPick={selectAndReveal} />
          <CopyLink path={here} view={view} />
          {inbox}
          <AccountButton />
        </div>
      </header>

      <NewCommitsBanner analysisId={meta.analysisId} branch={meta.branch} commit={meta.commit} version={current.version} analysed={analysed} />
      <MissingFromLink missing={missing} onDismiss={() => setMissing([])} />
      <CoverageBanner coverage={coverage} />

      <div className="flex min-h-0 flex-1">
        <Drawer open={railOpen} side="left" width="15rem" tour="categories">
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
          noted={noted}
          onSelect={select}
          onHover={hover}
          initial={{ compact: restored.view.compact, offsets: restored.view.scroll }}
          onView={onCardsView}
          banner={
            // Only while filtering, where it says what is filtered and how to undo it. The map needs no caption.
            filtering ? (
              <div className="flex items-center gap-2 rounded-full bg-surface/95 px-3.5 py-1.5 text-[11px] whitespace-nowrap text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border">
                <span>
                  Filtering: <span className="font-mono font-medium text-foreground">{filterName}</span>
                </span>
                <span className="font-mono">· {matchingCount} files</span>
                <button type="button" onClick={() => setFilter(NO_FILTER)} className="underline underline-offset-2 hover:text-foreground">
                  Clear
                </button>
              </div>
            ) : null
          }
        >
          {/* Each fades in as its panel finishes leaving, where the panel went. */}
          {!railOpen && (
            <button
              data-overlay
              type="button"
              data-tip="Show categories" aria-label="Show categories"
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
              data-tip="Show details" aria-label="Show details"
              onClick={() => setPaneOpen(true)}
              className="absolute top-32 right-3 flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border transition-[opacity,scale] delay-200 duration-200 ease-out hover:text-foreground starting:scale-90 starting:opacity-0"
            >
              <Icon name="network" className="size-4" />
            </button>
          )}
        </Canvas>

        <Drawer open={paneOpen} side="right" width="19rem" tour="details">
          {base !== null ? (
            <ComparePane
              analyses={finished}
              base={base}
              head={meta.analysisId}
              state={compareState}
              inHead={headPaths}
              hovered={hovered}
              notes={notes}
              onBase={chooseBase}
              onHead={chooseHead}
              onReveal={reveal}
              onHover={hover}
              onExit={() => setBase(null)}
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
            notes={notes}
            me={me}
            noteActions={noteActions}
            importsOf={importsOf}
            graph={graph}
            insights={insights}
            insightsOpen={insightsOpen}
            onInsightsOpen={setInsightsOpen}
            tab={tab}
            onTab={setTab}
            walk={walk}
            onWalk={setWalk}
            onSelect={selectAndReveal}
            onHover={hover}
            onCollapse={() => setPaneOpen(false)}
          />
          )}
        </Drawer>
      </div>

      {plainOpen && files.length > 0 && <Tour user={me} selection={selection} hovered={hovered} />}
      {plainOpen && canCompare && <CompareHint user={me} />}
    </div>
  );
}
