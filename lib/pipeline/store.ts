import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { formatCount } from "@/lib/stages";
import type { ParseResult } from "@/parser/types";

// Writes the parser's result as rows, unchanged. Nothing is added that the
// parser didn't return: an edge row exists only because the result has that edge.

type Db = SupabaseClient<Database>;

// Keeps each request well under PostgREST's body limit with room for long paths.
const CHUNK = 1000;

export interface StoreTarget {
  analysisId: string;
  orgId: string;
  /** Stamped on every file, so the database can refuse a superseded run's rows. */
  attempt: number;
}

export async function storeResult(
  db: Db,
  target: StoreTarget,
  result: ParseResult,
  progress: (message: string) => Promise<void>,
): Promise<void> {
  const { analysisId, orgId, attempt } = target;
  const base = { org_id: orgId, analysis_id: analysisId };

  const idOf = new Map<string, string>();
  await inChunks(result.files, "files", progress, async (chunk) => {
    const { data, error } = await db
      .from("files")
      .insert(
        chunk.map((f) => ({
          ...base,
          attempt,
          path: f.path,
          folder: f.folder,
          package: f.package,
          kind: f.kind,
          line_count: f.lines,
          bytes: f.bytes,
          content_hash: f.sha256,
          fan_in: f.fanIn,
          fan_out: f.fanOut,
        })),
      )
      .select("id, path");
    if (error) throw new Error(`Could not store files: ${error.message}`);
    for (const row of data) idOf.set(row.path, row.id);
  });
  const id = (path: string) => {
    const found = idOf.get(path);
    if (!found) throw new Error(`The result refers to ${path}, which is not among its files`);
    return found;
  };

  // Only the adapter writes roles; under the fallback every role is null and
  // nothing is written.
  const roles = result.files.flatMap((f) => (f.role === null ? [] : [{ path: f.path, role: f.role }]));
  await inChunks(roles, "file roles", progress, async (chunk) => {
    const { error } = await db
      .from("file_roles")
      .insert(chunk.map((f) => ({ org_id: orgId, file_id: id(f.path), role: f.role, source: "adapter" })));
    if (error) throw new Error(`Could not store file roles: ${error.message}`);
  });

  // Only routes the adapter recovered exactly; withheld ones go on the analysis row.
  await inChunks(result.routes, "routes", progress, async (chunk) => {
    const { error } = await db
      .from("routes")
      .insert(chunk.map((r) => ({ ...base, file_id: id(r.file), method: r.method, pattern: r.pattern, line: r.line })));
    if (error) throw new Error(`Could not store routes: ${error.message}`);
  });

  await inChunks(result.edges, "edges", progress, async (chunk) => {
    const { error } = await db.from("edges").insert(
      chunk.map((e) => ({
        ...base,
        source_file_id: id(e.from),
        target_file_id: id(e.to),
        kinds: e.kinds,
        type_only: e.typeOnly,
      })),
    );
    if (error) throw new Error(`Could not store edges: ${error.message}`);
  });

  await inChunks(result.imports, "imports", progress, async (chunk) => {
    const { error } = await db.from("imports").insert(
      chunk.map((r) => {
        const res = r.resolution;
        return {
          ...base,
          file_id: id(r.from),
          specifier: r.specifier,
          kind: r.kind,
          type_only: r.typeOnly,
          line: r.line,
          status: res.status,
          reason: res.status === "internal" ? null : res.reason,
          target: res.status === "internal" || res.status === "excluded" ? res.target : null,
          detail: res.status === "internal" ? null : res.detail,
        };
      }),
    );
    if (error) throw new Error(`Could not store imports: ${error.message}`);
  });
}

async function inChunks<T>(
  items: readonly T[],
  noun: string,
  progress: (message: string) => Promise<void>,
  write: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK) {
    await progress(`Storing ${noun}: ${formatCount(i)} of ${formatCount(items.length)}`);
    await write(items.slice(i, i + CHUNK));
  }
}

/** The coverage report as JSON the database accepts, built field by field rather than cast. */
export function toJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot store ${value} as JSON`);
    return value;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  throw new Error(`Cannot store a ${typeof value} as JSON`);
}
