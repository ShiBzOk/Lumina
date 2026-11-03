"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MODEL_CATEGORIES, type Framework, type ModelRole } from "@/lib/map/frameworks";
import { walk, DEFAULT_DEPTH, DEPTHS, type Adjacency, type WalkDirection } from "@/lib/map/graph";
import { sameSelection, type Selection } from "@/lib/map/highlight";
import { INSIGHT_SENTENCES, type Insights } from "@/lib/map/insights";
import { fileTypeOf, type MapNode, type RepoMap } from "@/lib/map/model";
import { countTypes, type RepoSummary } from "@/lib/map/summary";
import type { ImportRecord, RepoFile, Route, WithheldRoute } from "@/parser/types";
import { TYPE_COLOR } from "./colors";
import { Explanation, explainKey, type ExplainState } from "./explanation";
import { Icon, type IconName } from "./icons";

export type PaneTab = "structure" | "explanation";

/** How many rows a summary list shows before it is asked for the rest. */
const LIST_LIMIT = 8;

interface DetailPaneProps {
  analysisId: string;
  map: RepoMap;
  repo: string;
  /** The framework the adapter recognised, or null under the fallback. */
  framework: Framework | null;
  routes: readonly Route[];
  routesWithheld: readonly WithheldRoute[];
  summary: RepoSummary;
  selection: Selection;
  hovered: Selection;
  files: ReadonlyMap<string, RepoFile>;
  /** The model's labels for files convention left without a role. */
  modelRoles: ReadonlyMap<string, ModelRole>;
  /** Explanations fetched so far, by subject; they stay when the selection moves. */
  explanations: ReadonlyMap<string, ExplainState>;
  onExplain: (subject: NonNullable<Selection>) => void;
  model: string;
  tracing: boolean;
  importsOf: ReadonlyMap<string, readonly ImportRecord[]>;
  graph: Adjacency;
  insights: Insights;
  insightsOpen: boolean;
  onInsightsOpen: (open: boolean) => void;
  tab: PaneTab;
  onTab: (tab: PaneTab) => void;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onCollapse: () => void;
}

// Everything here is already in the browser: selecting something re-reads
// props, it never asks the server for anything.
export function DetailPane(props: DetailPaneProps) {
  const { map, selection, tab, onTab, onCollapse, graph, files, hovered, onSelect, onHover } = props;
  const node = selection?.kind === "node" ? map.nodes.find((n) => n.id === selection.id) : undefined;
  const path = selection?.kind === "file" ? selection.path : null;
  const subject = path !== null ? "file" : node ? "folder" : "repository";
  const target: Selection = path !== null ? { kind: "file", path } : node ? { kind: "node", id: node.id } : null;
  // What the prose may link to: real files, and folders that are boxes on the map.
  const filePaths = useMemo(() => new Set(files.keys()), [files]);
  const folderIds = useMemo(() => new Set(map.nodes.map((n) => n.id)), [map]);

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex h-11 shrink-0 items-end gap-4 border-b border-border px-3">
        <TabButton active={tab === "structure"} onClick={() => onTab("structure")}>
          Structure
        </TabButton>
        <TabButton active={tab === "explanation"} onClick={() => onTab("explanation")}>
          Explanation
        </TabButton>
        <span className="flex-1" />
        <button type="button" onClick={onCollapse} title="Hide details" className="mb-2 rounded p-1 text-muted hover:bg-background">
          <Icon name="chevronRight" className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "explanation" ? (
          target ? (
            <Explanation
              analysisId={props.analysisId}
              subject={target}
              context={
                target.kind === "file"
                  ? `The model is handed its source, the ${graph.out.get(target.path)?.length ?? 0} files it imports and the ${graph.in.get(target.path)?.length ?? 0} files importing it, as the parser found them.`
                  : `The model is handed this folder's ${node?.files.length ?? 0} files and the imports into and out of it, as the parser found them.`
              }
              unexplainable={target.kind === "file" && files.get(target.path)?.kind === "asset" ? "Assets aren't parsed, so there is nothing to explain from." : null}
              state={props.explanations.get(explainKey(target))}
              model={props.model}
              tracing={props.tracing}
              onExplain={() => props.onExplain(target)}
              files={filePaths}
              folders={folderIds}
              hovered={hovered}
              onSelect={onSelect}
              onHover={onHover}
            />
          ) : (
            <Empty icon="network" title="Nothing to explain yet" body={`Select a file or a folder on the map to explain it. The ${subject} as a whole isn't explained.`} />
          )
        ) : path !== null ? (
          <FileStructure {...props} path={path} />
        ) : node ? (
          <FolderStructure {...props} node={node} />
        ) : (
          <RepoStructure {...props} />
        )}
      </div>
    </aside>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2.5 text-xs font-medium ${
        active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-8 pt-24 text-center">
      <Icon name={icon} className="size-7 text-muted/60" />
      <p className="mt-3 text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function SectionTitle({ icon, children, aside }: { icon?: IconName; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted">
      {icon && <Icon name={icon} className="size-3" />}
      <span className="flex-1">{children}</span>
      {aside}
    </div>
  );
}

function folderPath(id: string) {
  return id === "." ? "./" : `${id}/`;
}

/**
 * One file path, anywhere in the pane. Clicking moves the map's selection to
 * it; hovering lights it on the map, and it lights up when the map hovers it.
 */
function PathButton({
  path,
  label = path,
  aside,
  selected = false,
  hovered,
  onSelect,
  onHover,
}: {
  path: string;
  /** Shown instead of the full path; the full path is always the tooltip. */
  label?: string;
  aside?: ReactNode;
  selected?: boolean;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}) {
  const target: Selection = { kind: "file", path };
  const lit = sameSelection(hovered, target);
  return (
    <button
      type="button"
      title={path}
      onClick={() => onSelect(target)}
      onMouseEnter={() => onHover(target)}
      onMouseLeave={() => onHover(null)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
        selected ? "bg-accent/8 ring-1 ring-accent/40" : lit ? "bg-accent/5 ring-1 ring-accent" : "hover:bg-background"
      }`}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[fileTypeOf(path)] }} aria-hidden />
      {/* Long paths lose their start, not their filename. */}
      <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${selected ? "font-medium text-accent" : ""}`} dir="rtl">
        <bdi>{label}</bdi>
      </span>
      {aside && <span className="flex shrink-0 gap-1.5 font-mono text-[9.5px] tabular-nums">{aside}</span>}
    </button>
  );
}

function PathList({ paths, empty, ...rest }: { paths: readonly string[]; empty: string; hovered: Selection; onSelect: (s: Selection) => void; onHover: (s: Selection) => void }) {
  if (paths.length === 0) return <p className="px-1 text-[11px] text-muted">{empty}</p>;
  return (
    <div className="rounded-lg border border-border p-1">
      {paths.map((p) => (
        <PathButton key={p} path={p} {...rest} />
      ))}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border px-2 py-1.5">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums">{value}</p>
      {note && <p className="truncate text-[9.5px] text-muted" title={note}>{note}</p>}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[11px]">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/**
 * Method, full pattern, and where it is written. Only what the adapter read
 * exactly; what it saw and couldn't state is listed apart, with the reason.
 */
function RouteTable({
  routes,
  withheld,
  empty,
  note,
  hovered,
  onSelect,
  onHover,
}: {
  routes: readonly Route[];
  withheld: readonly WithheldRoute[];
  empty: string;
  note: string | null;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}) {
  const [all, setAll] = useState(false);
  const [showWithheld, setShowWithheld] = useState(false);
  const shown = all ? routes : routes.slice(0, LIST_LIMIT);
  return (
    <>
      {routes.length === 0 ? (
        <p className="px-1 text-[11px] text-muted">{empty}</p>
      ) : (
        <div className="rounded-lg border border-border p-1">
          {shown.map((r) => {
            const target: Selection = { kind: "file", path: r.file };
            return (
              <button
                key={`${r.file}:${r.line}:${r.method}:${r.pattern}`}
                type="button"
                title={`${r.method} ${r.pattern}  ${r.file}:${r.line}`}
                onClick={() => onSelect(target)}
                onMouseEnter={() => onHover(target)}
                onMouseLeave={() => onHover(null)}
                className={`block w-full rounded-md px-2 py-1 text-left font-mono ${
                  sameSelection(hovered, target) ? "bg-accent/5 ring-1 ring-accent" : "hover:bg-background"
                }`}
              >
                <span className="flex items-baseline gap-2 text-[11px]">
                  <span className="w-12 shrink-0 text-[10px] font-semibold text-muted">{r.method}</span>
                  <span className="min-w-0 flex-1 truncate">{r.pattern}</span>
                </span>
                <span className="block truncate pl-14 text-[9.5px] text-muted" dir="rtl">
                  <bdi>
                    {r.file}:{r.line}
                  </bdi>
                </span>
              </button>
            );
          })}
          {routes.length > LIST_LIMIT && (
            <button type="button" onClick={() => setAll((a) => !a)} className="w-full px-2 py-1 text-left text-[10.5px] text-muted hover:text-foreground">
              {all ? "Show fewer" : `Show all ${routes.length}`}
            </button>
          )}
        </div>
      )}
      {note && <p className="mt-1 px-1 text-[10.5px] text-muted">{note}</p>}
      {withheld.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showWithheld}
            onClick={() => setShowWithheld((o) => !o)}
            className="mt-1 flex items-center gap-1 px-1 text-[10.5px] text-muted hover:text-foreground"
          >
            <Icon name={showWithheld ? "chevronDown" : "chevronRight"} className="size-3" />
            {withheld.length} withheld: method or path not exact
          </button>
          {showWithheld && (
            <div className="mt-1 rounded-lg border border-border p-1">
              {withheld.map((w) => (
                <button
                  key={`${w.file}:${w.line}:${w.reason}`}
                  type="button"
                  onClick={() => onSelect({ kind: "file", path: w.file })}
                  className="block w-full rounded-md px-2 py-1 text-left hover:bg-background"
                >
                  <span className="block truncate font-mono text-[10.5px]" dir="rtl">
                    <bdi>
                      {w.file}:{w.line}
                    </bdi>
                  </span>
                  <span className="block text-[10px] leading-snug text-muted">{w.reason}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** A ranked list that shows its head and expands only when asked. */
function RankedList({
  files,
  aside,
  empty,
  ...rest
}: {
  files: readonly RepoFile[];
  aside: (f: RepoFile) => ReactNode;
  empty: string;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}) {
  const [all, setAll] = useState(false);
  if (files.length === 0) return <p className="px-1 text-[11px] text-muted">{empty}</p>;
  const shown = all ? files : files.slice(0, LIST_LIMIT);
  return (
    <div className="rounded-lg border border-border p-1">
      {shown.map((f) => (
        <PathButton key={f.path} path={f.path} aside={aside(f)} {...rest} />
      ))}
      {files.length > LIST_LIMIT && (
        <button type="button" onClick={() => setAll((a) => !a)} className="w-full px-2 py-1 text-left text-[10.5px] text-muted hover:text-foreground">
          {all ? "Show fewer" : `Show all ${files.length}`}
        </button>
      )}
    </div>
  );
}

function RepoStructure({
  repo,
  framework,
  routes,
  routesWithheld,
  summary,
  modelRoles,
  insights,
  insightsOpen,
  onInsightsOpen,
  hovered,
  onSelect,
  onHover,
}: DetailPaneProps) {
  const noAdapter = framework === null;
  return (
    <div className="px-3 pb-6">
      <SectionTitle icon="repo">Repository</SectionTitle>
      <p className="font-mono text-[12px] font-semibold break-all">{repo}</p>
      <p className="mt-0.5 text-[11px] text-muted">{framework ? `Framework: ${framework.label}` : "No framework detected"}</p>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Stat label="Files" value={summary.files} />
        <Stat label="Imports" value={summary.imports} note={`${summary.resolvedImports} to repo files`} />
        <Stat label="Routes" value={routes.length} note={routesWithheld.length > 0 ? `${routesWithheld.length} withheld` : undefined} />
      </div>

      <SectionTitle icon="network" aside={<span className="font-mono text-[10px]">{routes.length}</span>}>
        Routes
      </SectionTitle>
      <RouteTable
        routes={routes}
        withheld={routesWithheld}
        empty={noAdapter ? "No framework recognised, so no routes were read." : "No route could be read exactly from the source."}
        note={framework?.routesNote ?? null}
        hovered={hovered}
        onSelect={onSelect}
        onHover={onHover}
      />

      <SectionTitle icon="arrowDownLeft" aside={<span className="font-mono text-[10px]">{summary.mostImported.length}</span>}>
        Most depended on
      </SectionTitle>
      <RankedList
        files={summary.mostImported}
        aside={(f) => <span className="text-incoming">{f.fanIn} in</span>}
        empty="No file in this repository imports another."
        hovered={hovered}
        onSelect={onSelect}
        onHover={onHover}
      />

      <SectionTitle icon="arrowUpRight" aside={<span className="font-mono text-[10px]">{summary.notImported.length}</span>}>
        Nothing imports these — start reading here
      </SectionTitle>
      <RankedList
        files={summary.notImported}
        aside={(f) => <span className="text-outgoing">{f.fanOut} out</span>}
        empty="Every file is imported by another."
        hovered={hovered}
        onSelect={onSelect}
        onHover={onHover}
      />

      <SectionTitle>No convention identified</SectionTitle>
      <p className="text-[11px]">
        <span className="font-mono font-semibold tabular-nums">{summary.unidentified}</span>
        <span className="text-muted"> of {summary.files} files</span>
      </p>
      {noAdapter && <p className="mt-0.5 text-[10.5px] text-muted">No framework adapter applied, so no file has a role from convention.</p>}
      {modelRoles.size > 0 && (
        <p className="mt-0.5 text-[10.5px] text-muted">
          <span className="font-mono text-foreground tabular-nums">{modelRoles.size}</span> of them labelled by the model, never as a page,
          route or controller.
        </p>
      )}

      {/* Last, and shut until asked: this explains a codebase, it doesn't grade one. */}
      <button
        type="button"
        aria-expanded={insightsOpen}
        onClick={() => onInsightsOpen(!insightsOpen)}
        className="mt-5 flex w-full items-center gap-1 border-t border-border pt-3 text-left text-[11px] font-medium text-muted hover:text-foreground"
      >
        <Icon name={insightsOpen ? "chevronDown" : "chevronRight"} className="size-3" />
        Insights
      </button>
      {insightsOpen && <InsightList insights={insights} hovered={hovered} onSelect={onSelect} onHover={onHover} />}
    </div>
  );
}

/** Files nothing imports first, because that one explains; loops and long files read closer to a verdict. */
function InsightList({
  insights,
  ...list
}: {
  insights: Insights;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}) {
  const count = (n: number) => <span className="font-mono text-[10px]">{n}</span>;
  return (
    <>
      <SectionTitle aside={insights.notImported && count(insights.notImported.length)}>{INSIGHT_SENTENCES.notImported}</SectionTitle>
      {insights.notImported === null ? (
        <p className="px-1 text-[10.5px] leading-relaxed text-muted">
          Not listed. No framework was recognised, so the files a framework reaches on its own (pages, routes, config) can&apos;t be
          told apart from files nothing uses.
        </p>
      ) : (
        <RankedList
          files={insights.notImported}
          aside={(f) => <span className="text-outgoing">{f.fanOut} out</span>}
          empty="Every file without a framework role is imported by another."
          {...list}
        />
      )}

      <SectionTitle aside={count(insights.heavilyImported.length)}>{INSIGHT_SENTENCES.heavilyImported}</SectionTitle>
      {Number.isFinite(insights.heavyThreshold) && (
        <p className="mb-1.5 px-1 text-[10.5px] text-muted">
          More than <span className="font-mono">{insights.heavyThreshold}</span> importers, far outside the spread of the rest.
        </p>
      )}
      <RankedList
        files={insights.heavilyImported}
        aside={(f) => <span className="text-incoming">{f.fanIn} in</span>}
        empty="No file is imported far more than the rest."
        {...list}
      />

      <SectionTitle aside={count(insights.cycles.length)}>{INSIGHT_SENTENCES.cycles}</SectionTitle>
      {insights.cycles.length === 0 ? (
        <p className="px-1 text-[11px] text-muted">No file imports itself through others.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {insights.cycles.map((loop) => (
            <div key={loop.join("\0")} className="rounded-lg border border-border p-1">
              {loop.map((p, i) => (
                <PathButton key={p} path={p} aside={<span className="text-muted">{i + 1}</span>} {...list} />
              ))}
              <p className="px-2 pt-0.5 pb-1 text-[10px] text-muted">Each imports the next; the last imports the first.</p>
            </div>
          ))}
        </div>
      )}

      <SectionTitle aside={count(insights.long.length)}>{INSIGHT_SENTENCES.long}</SectionTitle>
      <RankedList
        files={insights.long}
        aside={(f) => <span className="text-muted">{f.lines} lines</span>}
        empty="No file is that long."
        {...list}
      />
    </>
  );
}

function FileStructure({
  map,
  framework,
  path,
  files,
  modelRoles,
  importsOf,
  graph,
  hovered,
  onSelect,
  onHover,
}: DetailPaneProps & { path: string }) {
  const nodeId = map.nodeOf.get(path);
  const file = files.get(path);
  const modelRole = modelRoles.get(path);
  const records = importsOf.get(path) ?? [];
  const unresolved = records.filter((r) => r.resolution.status === "unresolved");
  const external = new Set(records.flatMap((r) => (r.resolution.status === "external" ? [r.specifier] : [])));
  // Counted from the very lists rendered below, so the two can't disagree.
  const dependsOn = graph.out.get(path) ?? [];
  const dependedOnBy = graph.in.get(path) ?? [];
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "no extension";
  const list = { hovered, onSelect, onHover };

  return (
    <div className="px-3 pb-6">
      <SectionTitle>
        <span className="text-xs font-semibold text-accent">Selected file</span>
      </SectionTitle>
      <PathButton path={path} selected {...list} />

      <div className="mt-2">
        <Fact label="Kind">
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <span className="size-1.5 rounded-full" style={{ background: TYPE_COLOR[fileTypeOf(path)] }} aria-hidden />
            <span className="font-mono">{ext}</span>
            <span className="text-muted">· {file?.kind === "asset" ? "asset, not parsed" : "parsed source"}</span>
            {file?.role && <span className="text-muted">· {framework?.categories.find((c) => c.role === file.role)?.label ?? file.role}</span>}
            {modelRole && <span className="text-muted">· {MODEL_CATEGORIES.find((c) => c.role === modelRole)?.label}, labelled by the model</span>}
          </span>
        </Fact>
        <Fact label="Length">
          <span className="font-mono tabular-nums">
            {file?.lines != null ? `${file.lines} lines · ` : ""}
            {file ? `${file.bytes} bytes` : ""}
          </span>
        </Fact>
        {nodeId !== undefined && (
          <Fact label="Folder">
            <button type="button" onClick={() => onSelect({ kind: "node", id: nodeId })} className="font-mono break-all hover:text-accent">
              {folderPath(nodeId)}
            </button>
          </Fact>
        )}
      </div>
      {file?.kind === "asset" && (
        <p className="mt-1 text-[10.5px] text-muted">On the map because a parsed import resolved to it.</p>
      )}

      <Walk path={path} graph={graph} {...list} />

      <SectionTitle icon="arrowUpRight" aside={<span className="font-mono text-[10px] text-outgoing">{dependsOn.length}</span>}>
        Depends on
      </SectionTitle>
      <PathList paths={dependsOn} empty="Imports no file in this repository." {...list} />
      {external.size > 0 && (
        <p className="mt-1.5 px-1 font-mono text-[10.5px] leading-relaxed text-muted">
          Also {external.size} external: {[...external].slice(0, 6).join(", ")}
          {external.size > 6 ? ", …" : ""}
        </p>
      )}

      <SectionTitle icon="arrowDownLeft" aside={<span className="font-mono text-[10px] text-incoming">{dependedOnBy.length}</span>}>
        Depended on by
      </SectionTitle>
      <PathList paths={dependedOnBy} empty="Nothing in this repository imports it." {...list} />

      {unresolved.length > 0 && (
        <>
          <SectionTitle icon="alert" aside={<span className="font-mono text-[10px]">{unresolved.length}</span>}>
            Unresolved imports
          </SectionTitle>
          <div className="flex flex-col gap-1">
            {unresolved.map((r) => (
              <div key={`${r.line}:${r.specifier}`} className="rounded-md border border-border px-2.5 py-1.5">
                <p className="truncate font-mono text-[11px]">
                  <span className="text-muted">L{r.line}</span> {r.specifier}
                </p>
                {r.resolution.status === "unresolved" && (
                  <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                    {r.resolution.reason}: {r.resolution.detail}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const WALKS: { direction: WalkDirection; label: string; icon: IconName; color: string; note: string; empty: string }[] = [
  {
    direction: "dependents",
    label: "Blast radius",
    icon: "arrowDownLeft",
    color: "text-incoming",
    note: "Files that would feel a change to this one, by how many imports away they are.",
    empty: "Nothing in this repository imports it.",
  },
  {
    direction: "dependencies",
    label: "Dependency chain",
    icon: "arrowUpRight",
    color: "text-outgoing",
    note: "Files this one needs, by how many imports away they are.",
    empty: "Imports no file in this repository.",
  },
];

/** Blast radius and dependency chain: one walk over the edge list, run in the browser on click. */
function Walk({
  path,
  graph,
  ...list
}: {
  path: string;
  graph: Adjacency;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}) {
  // Kept as the selection moves, so the same walk can be compared across files.
  const [direction, setDirection] = useState<WalkDirection | null>(null);
  const [depth, setDepth] = useState<number>(DEFAULT_DEPTH);
  const reached = useMemo(() => (direction ? walk(graph, path, direction, depth) : []), [graph, path, direction, depth]);
  const active = WALKS.find((w) => w.direction === direction);
  // Only the chosen level is shown. A file sits at the shortest distance it is
  // reached by, so one that is a direct neighbour never reappears further out.
  const atDepth = reached.filter((r) => r.depth === depth).map((r) => r.path);

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {WALKS.map((w) => (
          <button
            key={w.direction}
            type="button"
            aria-pressed={direction === w.direction}
            onClick={() => setDirection((d) => (d === w.direction ? null : w.direction))}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium ${
              direction === w.direction ? "border-accent/40 bg-accent/8 text-accent" : "border-border hover:bg-background"
            }`}
          >
            <Icon name={w.icon} className="size-3" />
            {w.label}
          </button>
        ))}
      </div>
      {active && (
        <>
          <SectionTitle aside={<span className={`font-mono text-[10px] ${active.color}`}>{atDepth.length} files</span>}>
            {active.label}
          </SectionTitle>
          <p className="mb-2 px-1 text-[10.5px] text-muted">{active.note}</p>
          <div className="mb-2 flex items-center gap-2 px-1 text-[10.5px] text-muted">
            <span>Levels deep</span>
            <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Levels deep">
              {DEPTHS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={depth === d}
                  onClick={() => setDepth(d)}
                  className={`w-6 rounded py-0.5 font-mono text-[10.5px] tabular-nums ${
                    depth === d ? "bg-accent/10 font-semibold text-accent" : "hover:bg-background hover:text-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {reached.length === 0 ? (
            <p className="px-1 text-[11px] text-muted">{active.empty}</p>
          ) : (
            <>
              <p className="mb-0.5 px-1 text-[10px] text-muted">{depth === 1 ? "Directly" : `${depth} steps away`}</p>
              <PathList paths={atDepth} empty={`No file is exactly ${depth} steps away.`} {...list} />
            </>
          )}
        </>
      )}
    </>
  );
}

function FolderStructure({ map, node, hovered, onSelect, onHover }: DetailPaneProps & { node: MapNode }) {
  const types = useMemo(() => countTypes(node.files.map((f) => f.path)), [node]);
  const { out, into } = useMemo(() => {
    const count = (list: Map<string, number>, key: string) => list.set(key, (list.get(key) ?? 0) + 1);
    const out = new Map<string, number>();
    const into = new Map<string, number>();
    for (const e of map.edges) {
      if (e.fromNode === e.toNode) continue;
      if (e.fromNode === node.id) count(out, e.toNode);
      if (e.toNode === node.id) count(into, e.fromNode);
    }
    const sorted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return { out: sorted(out), into: sorted(into) };
  }, [map.edges, node.id]);
  const label = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? id;

  const folderList = (list: [string, number][], empty: string) =>
    list.length === 0 ? (
      <p className="px-1 text-[11px] text-muted">{empty}</p>
    ) : (
      <div className="rounded-lg border border-border p-1">
        {list.map(([id, n]) => {
          const target: Selection = { kind: "node", id };
          return (
            <button
              key={id}
              type="button"
              title={folderPath(id)}
              onClick={() => onSelect(target)}
              onMouseEnter={() => onHover(target)}
              onMouseLeave={() => onHover(null)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                sameSelection(hovered, target) ? "bg-accent/5 ring-1 ring-accent" : "hover:bg-background"
              }`}
            >
              <Icon name="folder" className="size-3 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{label(id)}</span>
              <span className="font-mono text-[10px] text-muted tabular-nums">
                {n} {n === 1 ? "link" : "links"}
              </span>
            </button>
          );
        })}
      </div>
    );

  return (
    <div className="px-3 pb-6">
      <SectionTitle aside={<span className="font-mono text-[10px]">{node.files.length} files</span>}>
        <span className="text-xs font-semibold text-accent">Selected folder</span>
      </SectionTitle>
      <p className="rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] break-all">{folderPath(node.id)}</p>

      <SectionTitle>Kinds of file inside</SectionTitle>
      <div className="rounded-lg border border-border px-2 py-1">
        {types.map((t) => (
          <div key={t.type} className="flex items-center gap-2 py-0.5 text-[11px]">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[t.type] }} aria-hidden />
            <span className="flex-1 font-mono">{t.label}</span>
            <span className="font-mono tabular-nums">{t.count}</span>
          </div>
        ))}
      </div>

      <SectionTitle icon="arrowUpRight" aside={<span className="font-mono text-[10px]">{out.length}</span>}>
        Imports from folders
      </SectionTitle>
      {folderList(out, "No imports into other folders on the map.")}
      <SectionTitle icon="arrowDownLeft" aside={<span className="font-mono text-[10px]">{into.length}</span>}>
        Imported by folders
      </SectionTitle>
      {folderList(into, "No other folder on the map imports from it.")}

      <SectionTitle aside={<span className="font-mono text-[10px]">{node.files.length}</span>}>Files</SectionTitle>
      <div className="rounded-lg border border-border p-1">
        {node.files.map((f) => (
          <PathButton
            key={f.path}
            path={f.path}
            label={f.label}
            aside={
              <>
                <span className="text-incoming">{f.fanIn} in</span>
                <span className="text-outgoing">{f.fanOut} out</span>
              </>
            }
            hovered={hovered}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}
