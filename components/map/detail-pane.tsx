"use client";

import { useEffect, useMemo, useState } from "react";
import type { Selection } from "@/lib/map/highlight";
import type { FileRow, MapNode, RepoMap } from "@/lib/map/model";
import type { ImportRecord, RepoFile } from "@/parser/types";
import { TYPE_COLOR } from "./colors";
import { Icon, type IconName } from "./icons";

export type PaneTab = "overview" | "code";

interface DetailPaneProps {
  map: RepoMap;
  selection: Selection;
  files: ReadonlyMap<string, RepoFile>;
  importsOf: ReadonlyMap<string, readonly ImportRecord[]>;
  targetsOf: ReadonlyMap<string, readonly string[]>;
  importersOf: ReadonlyMap<string, readonly string[]>;
  tab: PaneTab;
  onTab: (tab: PaneTab) => void;
  onSelect: (selection: Selection) => void;
  onCollapse: () => void;
}

export function DetailPane(props: DetailPaneProps) {
  const { map, selection, tab, onTab, onCollapse } = props;
  const node = selection?.kind === "node" ? map.nodes.find((n) => n.id === selection.id) : undefined;
  const path = selection?.kind === "file" ? selection.path : null;

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex h-11 shrink-0 items-end gap-4 border-b border-border px-3">
        <TabButton active={tab === "overview"} onClick={() => onTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "code"} onClick={() => onTab("code")}>
          Code &amp; Snippet
        </TabButton>
        <span className="flex-1" />
        <button type="button" onClick={onCollapse} title="Hide details" className="mb-2 rounded p-1 text-muted hover:bg-background">
          <Icon name="chevronRight" className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {path !== null ? (
          tab === "overview" ? (
            <FileOverview {...props} path={path} />
          ) : (
            <FileCode path={path} file={props.files.get(path)} imports={props.importsOf.get(path) ?? []} />
          )
        ) : node ? (
          tab === "overview" ? (
            <NodeOverview {...props} node={node} />
          ) : (
            <Empty icon="network" title={node.label} body="Select a file in this folder to see its source." />
          )
        ) : (
          <Empty icon="network" title="No node selected" body="Click any folder card or file on the canvas to inspect its dependencies." />
        )}
      </div>
    </aside>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function SectionTitle({ icon, children, aside }: { icon?: IconName; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted">
      {icon && <Icon name={icon} className="size-3" />}
      <span className="flex-1">{children}</span>
      {aside}
    </div>
  );
}

function FileListButton({ row, selected, onClick }: { row: Pick<FileRow, "label" | "type" | "fanIn" | "fanOut">; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
        selected ? "bg-accent/8 ring-1 ring-accent/40" : "hover:bg-background"
      }`}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[row.type] }} aria-hidden />
      <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${selected ? "font-medium text-accent" : ""}`}>{row.label}</span>
      <span className="flex shrink-0 gap-1.5 font-mono text-[9.5px] tabular-nums">
        <span className="text-incoming">{row.fanIn} in</span>
        <span className="text-outgoing">{row.fanOut} out</span>
      </span>
    </button>
  );
}

function LinkList({ paths, rows, onSelect, empty }: { paths: readonly string[]; rows: ReadonlyMap<string, FileRow>; onSelect: (path: string) => void; empty: string }) {
  if (paths.length === 0) return <p className="px-1 text-[11px] text-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-1">
      {paths.map((p) => (
        <button
          key={p}
          type="button"
          title={p}
          onClick={() => onSelect(p)}
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left hover:border-accent/40 hover:bg-background"
        >
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[rows.get(p)?.type ?? "other"] }} aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]" dir="rtl">
            <bdi>{p}</bdi>
          </span>
          <Icon name="chevronRight" className="size-3 shrink-0 text-muted" />
        </button>
      ))}
    </div>
  );
}

function useRows(map: RepoMap) {
  return useMemo(() => new Map(map.nodes.flatMap((n) => n.files.map((f) => [f.path, f] as const))), [map]);
}

function FileOverview({
  map,
  path,
  files,
  importsOf,
  targetsOf,
  importersOf,
  onSelect,
}: DetailPaneProps & { path: string }) {
  const rows = useRows(map);
  const node = map.nodes.find((n) => n.id === map.nodeOf.get(path));
  const file = files.get(path);
  const records = importsOf.get(path) ?? [];
  const unresolved = records.filter((r) => r.resolution.status === "unresolved");
  const external = new Set(records.flatMap((r) => (r.resolution.status === "external" ? [r.specifier] : [])));
  const select = (p: string) => onSelect({ kind: "file", path: p });

  return (
    <div className="px-3 pb-6">
      {node && (
        <>
          <SectionTitle aside={<span className="font-mono text-[10px]">{node.files.length} files</span>}>
            <button type="button" onClick={() => onSelect({ kind: "node", id: node.id })} className="font-mono hover:text-accent">
              {node.id === "." ? "./" : `${node.id}/`}
            </button>
          </SectionTitle>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-1">
            {node.files.map((f) => (
              <FileListButton key={f.path} row={f} selected={f.path === path} onClick={() => select(f.path)} />
            ))}
          </div>
        </>
      )}

      <SectionTitle
        aside={
          <span className="font-mono text-[10px]">
            {file?.lines != null ? `${file.lines} lines` : file ? `${file.bytes} bytes` : ""}
          </span>
        }
      >
        <span className="text-xs font-semibold text-accent">Selected file</span>
      </SectionTitle>
      <p className="rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] break-all">{path}</p>
      {file?.kind === "asset" && (
        <p className="mt-1 text-[10.5px] text-muted">Not parsed: on the map because a parsed import resolved to it.</p>
      )}

      <SectionTitle icon="arrowUpRight">Imports ({targetsOf.get(path)?.length ?? 0})</SectionTitle>
      <LinkList paths={targetsOf.get(path) ?? []} rows={rows} onSelect={select} empty="No imports of files in this repository." />
      {external.size > 0 && (
        <p className="mt-1.5 px-1 font-mono text-[10.5px] leading-relaxed text-muted">
          + {external.size} external: {[...external].slice(0, 6).join(", ")}
          {external.size > 6 ? ", …" : ""}
        </p>
      )}

      <SectionTitle icon="arrowDownLeft">Imported by ({importersOf.get(path)?.length ?? 0})</SectionTitle>
      <LinkList paths={importersOf.get(path) ?? []} rows={rows} onSelect={select} empty="Nothing in this repository imports it." />

      {unresolved.length > 0 && (
        <>
          <SectionTitle icon="alert">Unresolved ({unresolved.length})</SectionTitle>
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

      <ImportDeclarations path={path} file={file} imports={records} />
    </div>
  );
}

// Fetched on selection and kept for the session: the source isn't derivable
// from the edge list, so this is the one place the pane waits on anything.
const sourceCache = new Map<string, string | null>();

function useSource(path: string, hasSource: boolean): { text: string | null; loading: boolean } {
  const [, setVersion] = useState(0);
  const cached = sourceCache.get(path);
  useEffect(() => {
    if (!hasSource || sourceCache.has(path)) return;
    let live = true;
    fetch(`/preview/source?path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((text) => {
        sourceCache.set(path, text);
        if (live) setVersion((v) => v + 1);
      });
    return () => {
      live = false;
    };
  }, [path, hasSource]);
  return { text: cached ?? null, loading: hasSource && cached === undefined };
}

function ImportDeclarations({ path, file, imports }: { path: string; file: RepoFile | undefined; imports: readonly ImportRecord[] }) {
  const { text, loading } = useSource(path, file?.lines != null);
  const [copied, setCopied] = useState(false);
  const lastImport = Math.max(0, ...imports.map((r) => r.line));
  const lines = text?.split(/\r?\n/) ?? [];
  // The file's head down to its last import, plus a few lines of what follows.
  const snippet = lines.slice(0, Math.min(lines.length, lastImport + 8));
  const importLines = new Set(imports.map((r) => r.line));

  return (
    <>
      <SectionTitle
        aside={
          text !== null && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(snippet.join("\n")).then(() => setCopied(true));
              }}
              onMouseLeave={() => setCopied(false)}
              className="flex items-center gap-1 text-[10.5px] hover:text-foreground"
            >
              <Icon name={copied ? "check" : "copy"} className="size-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          )
        }
      >
        Import declarations
      </SectionTitle>
      {file?.lines == null ? (
        <p className="px-1 text-[11px] text-muted">Binary file, no source to show.</p>
      ) : loading ? (
        <p className="px-1 text-[11px] text-muted">Loading source…</p>
      ) : text === null ? (
        <p className="px-1 text-[11px] text-danger">Source not found in the preview fixture.</p>
      ) : imports.length === 0 ? (
        <p className="px-1 text-[11px] text-muted">This file has no import statements.</p>
      ) : (
        <CodeBlock lines={snippet} marked={importLines} />
      )}
    </>
  );
}

function CodeBlock({ lines, marked, numbered = false }: { lines: readonly string[]; marked: ReadonlySet<number>; numbered?: boolean }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-[#111827] py-3 font-mono text-[11px] leading-[1.6] text-[#d1d5db]">
      {lines.map((line, i) => (
        <div key={i} className={`flex pr-3 ${marked.has(i + 1) ? "bg-white/[0.06] text-white" : ""}`}>
          {numbered && <span className="w-10 shrink-0 pr-3 text-right text-[#6b7280] select-none">{i + 1}</span>}
          <span className={numbered ? "" : "pl-3"}>{line || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function FileCode({ path, file, imports }: { path: string; file: RepoFile | undefined; imports: readonly ImportRecord[] }) {
  const { text, loading } = useSource(path, file?.lines != null);
  const marked = useMemo(() => new Set(imports.map((r) => r.line)), [imports]);
  return (
    <div className="px-3 pb-6">
      <SectionTitle aside={<span className="font-mono text-[10px]">{file?.lines ?? 0} lines</span>}>
        <span className="font-mono break-all text-foreground">{path}</span>
      </SectionTitle>
      {file?.lines == null ? (
        <p className="px-1 text-[11px] text-muted">Binary file, no source to show.</p>
      ) : loading ? (
        <p className="px-1 text-[11px] text-muted">Loading source…</p>
      ) : text === null ? (
        <p className="px-1 text-[11px] text-danger">Source not found in the preview fixture.</p>
      ) : (
        <CodeBlock lines={text.split(/\r?\n/)} marked={marked} numbered />
      )}
    </div>
  );
}

function NodeOverview({ map, node, onSelect }: DetailPaneProps & { node: MapNode }) {
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
      <div className="flex flex-col gap-1">
        {list.map(([id, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect({ kind: "node", id })}
            className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left hover:border-accent/40 hover:bg-background"
          >
            <Icon name="folder" className="size-3 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{label(id)}</span>
            <span className="font-mono text-[10px] text-muted tabular-nums">
              {n} {n === 1 ? "link" : "links"}
            </span>
          </button>
        ))}
      </div>
    );

  return (
    <div className="px-3 pb-6">
      <SectionTitle aside={<span className="font-mono text-[10px]">{node.files.length} files</span>}>
        <span className="text-xs font-semibold text-accent">Selected folder</span>
      </SectionTitle>
      <p className="rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] break-all">
        {node.id === "." ? "./" : `${node.id}/`}
      </p>
      <SectionTitle icon="arrowUpRight">Imports from ({out.length})</SectionTitle>
      {folderList(out, "No imports into other folders on the map.")}
      <SectionTitle icon="arrowDownLeft">Imported by ({into.length})</SectionTitle>
      {folderList(into, "No other folder on the map imports from it.")}
      <SectionTitle>Files</SectionTitle>
      <div className="rounded-lg border border-border p-1">
        {node.files.map((f) => (
          <FileListButton key={f.path} row={f} onClick={() => onSelect({ kind: "file", path: f.path })} />
        ))}
      </div>
    </div>
  );
}
