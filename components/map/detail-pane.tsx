"use client";

import { useMemo, useState, type ReactNode } from "react";
import { sameSelection, type Selection } from "@/lib/map/highlight";
import { fileTypeOf, type MapNode, type RepoMap } from "@/lib/map/model";
import { countTypes, type RepoSummary } from "@/lib/map/summary";
import type { ImportRecord, RepoFile } from "@/parser/types";
import { TYPE_COLOR } from "./colors";
import { Icon, type IconName } from "./icons";

export type PaneTab = "structure" | "explanation";

/** How many rows a summary list shows before it is asked for the rest. */
const LIST_LIMIT = 8;

interface DetailPaneProps {
  map: RepoMap;
  repo: string;
  /** The framework adapter the parser chose; "none" is the fallback. */
  adapter: string;
  summary: RepoSummary;
  selection: Selection;
  hovered: Selection;
  files: ReadonlyMap<string, RepoFile>;
  importsOf: ReadonlyMap<string, readonly ImportRecord[]>;
  targetsOf: ReadonlyMap<string, readonly string[]>;
  importersOf: ReadonlyMap<string, readonly string[]>;
  tab: PaneTab;
  onTab: (tab: PaneTab) => void;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onCollapse: () => void;
}

// Everything here is already in the browser: selecting something re-reads
// props, it never asks the server for anything.
export function DetailPane(props: DetailPaneProps) {
  const { map, selection, tab, onTab, onCollapse } = props;
  const node = selection?.kind === "node" ? map.nodes.find((n) => n.id === selection.id) : undefined;
  const path = selection?.kind === "file" ? selection.path : null;
  const subject = path !== null ? "file" : node ? "folder" : "repository";

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
          <Empty icon="network" title="No explanation yet" body={`Nothing has been written about this ${subject}.`} />
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

function RepoStructure({ repo, adapter, summary, hovered, onSelect, onHover }: DetailPaneProps) {
  const noAdapter = adapter === "none";
  return (
    <div className="px-3 pb-6">
      <SectionTitle icon="repo">Repository</SectionTitle>
      <p className="font-mono text-[12px] font-semibold break-all">{repo}</p>
      <p className="mt-0.5 text-[11px] text-muted">{noAdapter ? "No framework detected" : `Framework: ${adapter}`}</p>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Stat label="Files" value={summary.files} />
        <Stat label="Imports" value={summary.imports} note={`${summary.resolvedImports} to repo files`} />
        {/* No adapter extracts routes yet. A route that can't be recovered
            exactly is shown as absent, never as a zero. */}
        <Stat label="Routes" value="—" note="not extracted" />
      </div>

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
      {noAdapter && <p className="mt-0.5 text-[10.5px] text-muted">No framework adapter applied, so no file has a role.</p>}
    </div>
  );
}

function FileStructure({
  map,
  path,
  files,
  importsOf,
  targetsOf,
  importersOf,
  hovered,
  onSelect,
  onHover,
}: DetailPaneProps & { path: string }) {
  const nodeId = map.nodeOf.get(path);
  const file = files.get(path);
  const records = importsOf.get(path) ?? [];
  const unresolved = records.filter((r) => r.resolution.status === "unresolved");
  const external = new Set(records.flatMap((r) => (r.resolution.status === "external" ? [r.specifier] : [])));
  // Counted from the very lists rendered below, so the two can't disagree.
  const dependsOn = targetsOf.get(path) ?? [];
  const dependedOnBy = importersOf.get(path) ?? [];
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
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: TYPE_COLOR[fileTypeOf(path)] }} aria-hidden />
            <span className="font-mono">{ext}</span>
            <span className="text-muted">· {file?.kind === "asset" ? "asset, not parsed" : "parsed source"}</span>
            {file?.role && <span className="text-muted">· {file.role}</span>}
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
