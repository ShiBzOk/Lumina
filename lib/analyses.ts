import { connection } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isStale } from "@/lib/stages";
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

export async function listAnalyses() {
  const supabase = await reader();
  const { data, error } = await supabase
    .from("analyses")
    .select(
      `id, status, stage, stage_message, stage_changed_at, error, branch, commit_sha, file_count, package_count, created_at, ${PROJECT}`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Could not list analyses: ${error.message}`);
  // Staleness is decided once, on the server, so it and the browser agree on it.
  const now = Date.now();
  return data.map((a) => ({ ...a, stale: isStale(a.status, a.stage_changed_at, now) }));
}

export type AnalysisListItem = Awaited<ReturnType<typeof listAnalyses>>[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when it doesn't exist or belongs to another organization; the two are indistinguishable by design. */
export async function getAnalysis(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await reader();
  const { data, error } = await supabase
    .from("analyses")
    .select(
      `id, project_id, status, stage, stage_message, stage_changed_at, error, branch, commit_sha, adapter, coverage, routes_withheld, created_at, ${PROJECT}`,
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
}

// PostgREST returns at most 1000 rows per request. The first page also brings
// the total, then the rest are requested together.
const PAGE = 1000;

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

/** The stored rows of a finished analysis, rebuilt into exactly what the parser returned. */
export async function loadGraph(analysis: Analysis): Promise<StoredGraph> {
  const supabase = await reader();
  const id = analysis.id;
  const count = (c: boolean) => (c ? ("exact" as const) : undefined);

  const [fileRows, roleRows, edgeRows, importRows, routeRows] = await Promise.all([
    readAll("files", (from, to, c) =>
      supabase
        .from("files")
        .select("id, path, folder, package, kind, line_count, bytes, content_hash, fan_in, fan_out", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    // Roles have no analysis column; they arrive through their file.
    readAll("file roles", (from, to, c) =>
      supabase
        .from("file_roles")
        .select("file_id, role, file:files!inner(analysis_id)", { count: count(c) })
        .eq("file.analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    readAll("edges", (from, to, c) =>
      supabase
        .from("edges")
        .select("source_file_id, target_file_id, kinds, type_only", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    readAll("imports", (from, to, c) =>
      supabase
        .from("imports")
        .select("file_id, specifier, kind, type_only, line, status, reason, target, detail", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    readAll("routes", (from, to, c) =>
      supabase
        .from("routes")
        .select("file_id, method, pattern, line", { count: count(c) })
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
  ]);

  const roleOf = new Map(roleRows.map((r) => [r.file_id, r.role]));
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

  return {
    files,
    edges,
    imports,
    routes,
    routesWithheld: readRoutesWithheld(analysis.routes_withheld),
    coverage: readCoverage(analysis.coverage),
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
