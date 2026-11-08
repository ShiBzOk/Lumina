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
): Promise<Map<string, string>> {
  const { analysisId, orgId, attempt } = target;
  const base = { org_id: orgId, analysis_id: analysisId };
  const report = throttled(progress);

  // Files first: every other row names one by id.
  const idOf = new Map<string, string>();
  let filesDone = 0;
  await all(
    chunks(result.files, async (chunk) => {
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
      filesDone += chunk.length;
      await report(`Storing files: ${formatCount(filesDone)} of ${formatCount(result.files.length)}`);
    }),
  );
  const id = (path: string) => {
    const found = idOf.get(path);
    if (!found) throw new Error(`The result refers to ${path}, which is not among its files`);
    return found;
  };

  // Only the adapter writes roles; under the fallback every role is null and
  // nothing is written.
  const roles = result.files.flatMap((f) => (f.role === null ? [] : [{ path: f.path, role: f.role }]));
  // The other tables don't depend on each other, so their chunks share one queue.
  const total = roles.length + result.routes.length + result.edges.length + result.imports.length;
  let done = 0;
  const stored = (count: number) => {
    done += count;
    return report(`Storing edges, imports and roles: ${formatCount(done)} of ${formatCount(total)} rows`);
  };

  await all([
    ...chunks(roles, async (chunk) => {
      const { error } = await db
        .from("file_roles")
        .insert(chunk.map((f) => ({ ...base, file_id: id(f.path), role: f.role, source: "adapter" })));
      if (error) throw new Error(`Could not store file roles: ${error.message}`);
      await stored(chunk.length);
    }),
    // Only routes the adapter recovered exactly; withheld ones go on the analysis row.
    ...chunks(result.routes, async (chunk) => {
      const { error } = await db
        .from("routes")
        .insert(chunk.map((r) => ({ ...base, file_id: id(r.file), method: r.method, pattern: r.pattern, line: r.line })));
      if (error) throw new Error(`Could not store routes: ${error.message}`);
      await stored(chunk.length);
    }),
    ...chunks(result.edges, async (chunk) => {
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
      await stored(chunk.length);
    }),
    ...chunks(result.imports, async (chunk) => {
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
      await stored(chunk.length);
    }),
  ]);
  // Path → file id, for anything written about these files afterwards.
  return idOf;
}

// Requests in flight at once. A large repository is tens of chunks, and sent
// one after another their round trips were most of the stage.
const IN_FLIGHT = 6;

/** One task per chunk of rows. */
function chunks<T>(items: readonly T[], write: (chunk: T[]) => Promise<void>): (() => Promise<void>)[] {
  const tasks: (() => Promise<void>)[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    tasks.push(() => write(chunk));
  }
  return tasks;
}

/**
 * Runs every task, at most IN_FLIGHT at a time. After a failure nothing new
 * starts, and the error is thrown only once the running ones have settled:
 * the run's cleanup deletes this attempt's rows, and a write still in flight
 * could otherwise land after it.
 */
async function all(tasks: readonly (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  const failures: unknown[] = [];
  const worker = async () => {
    while (failures.length === 0 && next < tasks.length) {
      const task = tasks[next++];
      try {
        await task();
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, tasks.length) }, worker));
  if (failures.length > 0) throw failures[0];
}

// One progress write a second at most. Each is an update the database then
// broadcasts, and one before every chunk doubled the stage's round trips.
function throttled(progress: (message: string) => Promise<void>): (message: string) => Promise<void> {
  let last = 0;
  return async (message) => {
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    await progress(message);
  };
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
