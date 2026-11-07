import { connection } from "next/server";
import { MODEL_ROLES, type ModelRole } from "@/lib/map/frameworks";
import { createServerSupabase } from "@/lib/supabase";
import { isStale, KEPT_ANALYSES } from "@/lib/stages";
import { readCoverage, readRoutesWithheld } from "@/parser/io";
import {
  EXCLUDED_REASONS,
  EXTERNAL_REASONS,
  IMPORT_KINDS,
  UNRESOLVED_REASONS,
  type Coverage,
  type Edge,
  type ImportRecord,
  type RepoFile,
  type Resolution,
  type Route,
  type WithheldRoute,
} from "@/parser/types";

// No organization filter anywhere in here, on purpose. Which rows come back is
// decided by the policy reading the org claim off the token; if another
// organization's row ever appears, the policy is what's wrong.

// supabase-js fetches the token the moment the client is built. Waiting for
// the request first keeps that out of prerendering, where there is no token.
async function reader() {
  await connection();
  return createServerSupabase();
}

const PROJECT = "project:projects!analyses_project_id_org_id_fkey(repo_owner, repo_name, description)";

const ANALYSES = "analyses!analyses_project_id_org_id_fkey";

/**
 * One entry per repository: its latest analysis, whatever state that is in,
 * and which analysis opening the repository should land on.
 */
export async function listRepositories() {
  const supabase = await reader();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `id, repo_owner, repo_name,
       latest:${ANALYSES}(id, status, stage, stage_message, stage_changed_at, error, branch, commit_sha, version, file_count, package_count, created_at),
       finished:${ANALYSES}(id)`,
    )
    .order("created_at", { referencedTable: "latest", ascending: false })
    .limit(1, { referencedTable: "latest" })
    .eq("finished.status", "complete")
    .order("created_at", { referencedTable: "finished", ascending: false })
    .limit(1, { referencedTable: "finished" })
    .limit(100);
  if (error) throw new Error(`Could not list repositories: ${error.message}`);

  // Staleness is decided once, on the server, so it and the browser agree on it.
  const now = Date.now();
  return data
    .flatMap((p) => {
      const [latest] = p.latest;
      if (!latest) return [];
      const live = latest.status === "queued" || latest.status === "running";
      return [
        {
          ...latest,
          repo: `${p.repo_owner}/${p.repo_name}`,
          stale: isStale(latest.status, latest.stage_changed_at, now),
          // A run in progress opens on its progress; otherwise the latest map,
          // so a failed re-run doesn't stand between a repository and its map.
          open: live ? latest.id : (p.finished[0]?.id ?? latest.id),
        },
      ];
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

export type RepositoryListItem = Awaited<ReturnType<typeof listRepositories>>[number];

/** One repository's analyses, newest first. A finishing run may briefly make it one more than are kept. */
export async function listProjectAnalyses(projectId: string) {
  const supabase = await reader();
  const { data, error } = await supabase
    .from("analyses")
    .select("id, status, branch, commit_sha, version, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(KEPT_ANALYSES + 5);
  if (error) throw new Error(`Could not list the repository's analyses: ${error.message}`);
  return data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when it doesn't exist or belongs to another organization; the two are indistinguishable by design. */
export async function getAnalysis(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await reader();
  const { data, error } = await supabase
    .from("analyses")
    .select(
      `id, project_id, status, stage, stage_message, stage_changed_at, error, branch, commit_sha, version, adapter, coverage, routes_withheld, created_at, ${PROJECT}`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read the analysis: ${error.message}`);
  return data && { ...data, stale: isStale(data.status, data.stage_changed_at, Date.now()) };
}

export type Analysis = NonNullable<Awaited<ReturnType<typeof getAnalysis>>>;

export interface StoredGraph {
  files: RepoFile[];
  edges: Edge[];
  imports: ImportRecord[];
  routes: Route[];
  routesWithheld: WithheldRoute[];
  coverage: Coverage;
  /** The model's roles for files convention didn't identify. Kept apart from adapter roles, which carry structure. */
  labels: { path: string; role: ModelRole }[];
}

// Matches the project's "Max rows" setting (Supabase → Project Settings → Data
// API), raised from the default 1000. At 1000 a large map was dozens of
// requests that queued behind each other; at 10000 it is a handful. If the
// setting is ever lowered below this, a page comes back short and the count
// check below fails the load rather than drawing part of the graph.
// The first page also brings the total, then the rest are requested together.
const PAGE = 10000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

async function readAll<T>(what: string, page: (from: number, to: number, count: boolean) => Page<T>): Promise<T[]> {
  const first = await page(0, PAGE - 1, true);
  if (first.error) throw new Error(`Could not read ${what}: ${first.error.message}`);
  const total = first.count ?? 0;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => page((i + 1) * PAGE, (i + 2) * PAGE - 1, false)),
  );
  const rows = [...(first.data ?? [])];
  for (const r of rest) {
    if (r.error) throw new Error(`Could not read ${what}: ${r.error.message}`);
    rows.push(...(r.data ?? []));
  }
  if (rows.length !== total) throw new Error(`Read ${rows.length} ${what} but ${total} are stored`);
  return rows;
}

type Reader = Awaited<ReturnType<typeof reader>>;
const count = (c: boolean) => (c ? ("exact" as const) : undefined);

/** Files, their roles and the edges between them: what the map is drawn from. */
export interface StoredStructure {
  files: RepoFile[];
  edges: Edge[];
  labels: StoredGraph["labels"];
}

// A whole table of one analysis, with how long it took in the server log:
// opening a large map was slow, and this says which table it was waiting on.
async function readTable<T>(what: string, page: (from: number, to: number, count: boolean) => Page<T>): Promise<T[]> {
  const started = performance.now();
  const rows = await readAll(what, page);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`  ${what}: ${rows.length} rows in ${Math.max(1, Math.ceil(rows.length / PAGE))} pages, ${seconds}s`);
  return rows;
}

async function readStructure(supabase: Reader, id: string) {
  const [fileRows, roleRows, edgeRows] = await Promise.all([
    readTable("files", (from, to, c) =>
      supabase
        .from("files")
        .select("id, path, folder, package, kind, line_count, bytes, content_hash, fan_in, fan_out", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    // Roles have no analysis column; they arrive through their file.
    readTable("file roles", (from, to, c) =>
      supabase
        .from("file_roles")
        .select("file_id, role, source, file:files!inner(analysis_id)", { count: count(c) })
        .eq("file.analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    readTable("edges", (from, to, c) =>
      supabase
        .from("edges")
        .select("source_file_id, target_file_id, kinds, type_only", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
  ]);

  const roleOf = new Map<string, string>();
  for (const r of roleRows) {
    if (member(r.source, ["adapter", "model"] as const, "file_roles.source") === "adapter") roleOf.set(r.file_id, r.role);
  }
  const pathOf = new Map(fileRows.map((f) => [f.id, f.path]));
  const path = (fileId: string, at: string) => {
    const p = pathOf.get(fileId);
    if (p === undefined) mismatch(at, "a file of this analysis");
    return p;
  };

  const files: RepoFile[] = fileRows
    .map((f) => ({
      path: f.path,
      folder: f.folder,
      package: f.package,
      kind: member(f.kind, ["source", "asset"] as const, `files.kind of ${f.path}`),
      lines: f.line_count,
      bytes: f.bytes,
      sha256: f.content_hash,
      role: roleOf.get(f.id) ?? null,
      fanIn: f.fan_in,
      fanOut: f.fan_out,
    }))
    .sort((a, b) => compare(a.path, b.path));

  const edges: Edge[] = edgeRows
    .map((e) => ({
      from: path(e.source_file_id, "edges.source_file_id"),
      to: path(e.target_file_id, "edges.target_file_id"),
      kinds: e.kinds.map((k) => member(k, IMPORT_KINDS, "edges.kinds")),
      typeOnly: e.type_only,
    }))
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));

  const labels = roleRows
    .filter((r) => r.source === "model")
    .map((r) => ({ path: path(r.file_id, "file_roles.file_id"), role: member(r.role, MODEL_ROLES, "file_roles.role") }))
    .sort((a, b) => compare(a.path, b.path));

  const structure: StoredStructure = { files, edges, labels };
  return { structure, path };
}

/** The stored rows of a finished analysis, rebuilt into exactly what the parser returned. */
export async function loadGraph(analysis: Analysis): Promise<StoredGraph> {
  const started = performance.now();
  const supabase = await reader();
  const id = analysis.id;

  const [{ structure, path }, importRows, routeRows] = await Promise.all([
    readStructure(supabase, id),
    readTable("imports", (from, to, c) =>
      supabase
        .from("imports")
        .select("file_id, specifier, kind, type_only, line, status, reason, target, detail", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    readTable("routes", (from, to, c) =>
      supabase
        .from("routes")
        .select("file_id, method, pattern, line", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
  ]);

  const imports: ImportRecord[] = importRows.map((r) => ({
    from: path(r.file_id, "imports.file_id"),
    specifier: r.specifier,
    kind: member(r.kind, IMPORT_KINDS, "imports.kind"),
    typeOnly: r.type_only,
    line: r.line,
    resolution: resolution(r),
  }));

  // Stored in insertion order, which was the adapter's; sorted again so the table doesn't depend on it.
  const routes: Route[] = routeRows
    .map((r) => ({ file: path(r.file_id, "routes.file_id"), line: r.line, method: r.method, pattern: r.pattern }))
    .sort((a, b) => compare(a.pattern, b.pattern) || compare(a.method, b.method) || compare(a.file, b.file));

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Loaded analysis ${id}: ${structure.files.length} files, ${structure.edges.length} edges, ${imports.length} imports in ${seconds}s`);
  return {
    ...structure,
    imports,
    routes,
    routesWithheld: readRoutesWithheld(analysis.routes_withheld),
    coverage: readCoverage(analysis.coverage),
  };
}

/** Files, roles and edges only: a folder's explanation needs every path but no import rows. */
export async function loadStructure(analysis: Analysis): Promise<StoredStructure> {
  return (await readStructure(await reader(), analysis.id)).structure;
}

/** One file and its direct neighbours, read on their own rather than out of the whole graph. */
export interface FileNeighbourhood {
  path: string;
  kind: RepoFile["kind"];
  sha256: string;
  /** Its role, from convention or the model, whichever gave it one. */
  role: string | null;
  /** Files it imports, sorted by path. */
  imports: string[];
  /** Files that import it, sorted by path. */
  importedBy: string[];
  /** Package specifiers it imports, distinct and sorted. */
  externals: string[];
}

// Sorted the way the whole graph sorts its edges, so a file's neighbours read
// either way make the same explanation cache key.
export async function loadFileNeighbourhood(analysis: Analysis, filePath: string): Promise<FileNeighbourhood | null> {
  const supabase = await reader();
  const { data: file, error } = await supabase
    .from("files")
    .select("id, kind, content_hash")
    .eq("analysis_id", analysis.id)
    .eq("path", filePath)
    .maybeSingle();
  if (error) throw new Error(`Could not read ${filePath}: ${error.message}`);
  if (!file) return null;

  const [roleRows, outRows, inRows, externalRows] = await Promise.all([
    readAll("file roles", (from, to, c) =>
      supabase.from("file_roles").select("role, source", { count: count(c) }).eq("file_id", file.id).order("id").range(from, to),
    ),
    readAll("edges", (from, to, c) =>
      supabase
        .from("edges")
        .select("target:files!edges_target_file_id_org_id_fkey(path)", { count: count(c) })
        .eq("source_file_id", file.id)
        .order("id")
        .range(from, to),
    ),
    readAll("edges", (from, to, c) =>
      supabase
        .from("edges")
        .select("source:files!edges_source_file_id_org_id_fkey(path)", { count: count(c) })
        .eq("target_file_id", file.id)
        .order("id")
        .range(from, to),
    ),
    readAll("imports", (from, to, c) =>
      supabase
        .from("imports")
        .select("specifier", { count: count(c) })
        .eq("file_id", file.id)
        .eq("status", "external")
        .order("id")
        .range(from, to),
    ),
  ]);

  // At most one row: a file's role is unique to it, whoever gave it.
  const [role] = roleRows;
  if (role && member(role.source, ["adapter", "model"] as const, "file_roles.source") === "model") {
    member(role.role, MODEL_ROLES, "file_roles.role");
  }
  return {
    path: filePath,
    kind: member(file.kind, ["source", "asset"] as const, `files.kind of ${filePath}`),
    sha256: file.content_hash,
    role: role?.role ?? null,
    imports: outRows.map((r) => r.target.path).sort(compare),
    importedBy: inRows.map((r) => r.source.path).sort(compare),
    externals: [...new Set(externalRows.map((r) => r.specifier))].sort(),
  };
}

function resolution(r: { status: string; reason: string | null; target: string | null; detail: string | null }): Resolution {
  const status = member(r.status, ["internal", "external", "excluded", "unresolved"] as const, "imports.status");
  const need = (v: string | null, column: string) => {
    if (v === null) mismatch(`imports.${column}`, `set for a ${status} import`);
    return v;
  };
  switch (status) {
    case "internal":
      return { status, target: need(r.target, "target") };
    case "external":
      return { status, reason: member(r.reason, EXTERNAL_REASONS, "imports.reason"), detail: need(r.detail, "detail") };
    case "excluded":
      return {
        status,
        reason: member(r.reason, EXCLUDED_REASONS, "imports.reason"),
        target: need(r.target, "target"),
        detail: need(r.detail, "detail"),
      };
    case "unresolved":
      return { status, reason: member(r.reason, UNRESOLVED_REASONS, "imports.reason"), detail: need(r.detail, "detail") };
  }
}

// Stored rows are checked against the parser's vocabulary on the way out, so a
// row that doesn't fit fails here, loudly, rather than drawing something wrong.
function member<T extends string>(value: unknown, values: readonly T[], at: string): T {
  const hit = values.find((v) => v === value);
  if (hit === undefined) mismatch(at, `one of ${values.join(", ")}, got ${String(value)}`);
  return hit;
}

function mismatch(at: string, expected: string): never {
  throw new Error(`Stored analysis does not match the parser's contract: ${at} should be ${expected}`);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
