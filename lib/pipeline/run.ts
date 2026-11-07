import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TablesUpdate } from "@/lib/database.types";
import { labelFiles, labelInputs } from "@/lib/ai/label";
import { createWriterSupabase } from "@/lib/supabase";
import { formatCount, KEPT_ANALYSES, type AnalysisStage } from "@/lib/stages";
import { readParseResult } from "@/parser/io";
import type { ParseResult } from "@/parser/types";
import { downloadArchive, selectFiles, type RepoRef } from "./github";
import { storeResult, toJson } from "./store";

export interface RunRequest {
  analysisId: string;
  projectId: string;
  /** Read off the verified Clerk token when the run was requested; the writer trusts nothing else. */
  orgId: string;
  repo: RepoRef;
  /** Resolved before the row was inserted; the run fetches exactly this and nothing else. */
  commit: string;
  /** What the commit was reached by, for messages. Null when it was asked for by hash. */
  branch: string | null;
  /** The attempt this run claimed. Every write is checked against it. */
  attempt: number;
}

// A parser that hangs stops reporting progress, so its deadline sits below the
// ten minutes after which a silent run counts as stale and may be re-run.
const PARSE_DEADLINE_MS = 8 * 60 * 1000;

// Thrown when a re-run has claimed this analysis. The run stops and writes
// nothing more, not even a failure: the row belongs to its successor.
class Superseded extends Error {}

// fetch → select → parse → store. Each stage is written before it starts, and
// the database publishes it. Whatever goes wrong, the catch at the bottom
// writes a failed row naming the stage, so no row is left mid-run by an error.
// A process that dies outright can't write anything; the dashboard's staleness
// check is what covers that.
export async function runAnalysis(request: RunRequest): Promise<void> {
  const db = createWriterSupabase();
  const { analysisId, orgId, repo, attempt } = request;
  const slug = `${repo.owner}/${repo.name}`;
  let stage: AnalysisStage = "fetching";
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "lumina-"));

  const update = async (values: TablesUpdate<"analyses">) => {
    const { data, error } = await db.from("analyses").update(values).eq("id", analysisId).eq("attempt", attempt).select("id");
    if (error) throw new Error(`Could not update the analysis: ${error.message}`);
    if (data.length === 0) throw new Superseded();
  };
  // One line per stage in the server log, so a slow run says where its time went.
  let stageStarted = performance.now();
  const timed = (finished: string) => {
    const now = performance.now();
    console.log(`Analysis ${analysisId} (${slug}): ${finished} took ${((now - stageStarted) / 1000).toFixed(1)}s`);
    stageStarted = now;
  };
  const enter = (next: AnalysisStage, message: string) => {
    if (next !== stage) timed(stage);
    stage = next;
    return update({ status: "running", stage: next, stage_message: message });
  };
  // Progress from inside a long stage, so the page shows it moving rather
  // than one message that might be stuck. Written at most once a second and
  // in order. A write that fails, a superseded run included, stops further
  // writes, and the stage throws it when it calls `settle`.
  const live = () => {
    let last = 0;
    let chain = Promise.resolve();
    let failure: { error: unknown } | null = null;
    return {
      say(message: string) {
        const now = Date.now();
        if (failure || now - last < 1000) return;
        last = now;
        chain = chain.then(() => update({ stage_message: message })).catch((error: unknown) => {
          failure ??= { error };
        });
      },
      async settle() {
        await chain;
        if (failure) throw failure.error;
      },
    };
  };

  try {
    const downloading = `Downloading ${slug}@${request.commit.slice(0, 7)}` + (request.branch ? ` (${request.branch})` : "");
    await enter("fetching", downloading);
    // Only this analysis's own rows, left by an earlier attempt at it that
    // stopped partway. Another analysis is touched only once this run has
    // finished, by `prune`. Routes, edges, imports and roles go with their files, and only
    // earlier attempts' files, so a run that lost its claim can't clear its successor's.
    {
      const { error } = await db.from("files").delete().eq("analysis_id", analysisId).lt("attempt", attempt);
      if (error) throw new Error(`Could not clear an earlier attempt's files: ${error.message}`);
    }
    const archive = path.join(work, "archive.tar.gz");
    const download = live();
    const bytes = await downloadArchive(repo, request.commit, archive, (received) => download.say(`${downloading}: ${size(received)}`));
    await download.settle();

    await enter("selecting", `Extracting ${size(bytes)} archive`);
    const dir = path.join(work, "repo");
    await fs.mkdir(dir);
    const selection = await selectFiles(archive, dir);
    await fs.rm(archive);
    const links = selection.links.length;
    await enter(
      "selecting",
      `Kept ${formatCount(selection.files)} files` + (links > 0 ? `; ${formatCount(links)} links not followed` : ""),
    );

    await enter("parsing", `Resolving imports across ${formatCount(selection.files)} files`);
    const parsing = live();
    const result = await parse(dir, path.join(work, "result.json"), (done, total) =>
      parsing.say(`Parsed ${formatCount(done)} of ${formatCount(total)} files, resolving their imports`),
    );
    await parsing.settle();
    // Nothing to draw is not a finished map. Without this, a repository in
    // another language would complete as an empty canvas that looks whole.
    if (result.coverage.filesFound === 0) throw new Error(noSourceFiles(selection.extensions));
    // The archive's links never reached the disk, so the walk couldn't see
    // them. They are added exactly as the walk would have reported them.
    for (const link of selection.links) {
      result.coverage.excludedPaths.push({ path: link, reason: "symlink", detail: "symbolic links are not followed" });
    }

    await enter(
      "storing",
      `Storing ${formatCount(result.files.length)} files, ${formatCount(result.edges.length)} edges, ${formatCount(result.imports.length)} imports`,
    );
    const idOf = await storeResult(db, { analysisId, orgId, attempt }, result, (message) => update({ stage_message: message }));

    // Only source files convention said nothing about. Assets have no text to read.
    const unidentified = await labelInputs(dir, result, (f) => f.kind === "source" && f.role === null);
    await enter("labelling", `Labelling ${formatCount(unidentified.length)} files no convention identified`);
    const labels = await labelFiles(db, orgId, unidentified, (done, cached) =>
      update({ stage_message: `Labelled ${formatCount(done)} of ${formatCount(unidentified.length)} files (${formatCount(cached)} from cache)` }),
    );
    const rows = [...labels].map(([path, role]) => {
      const fileId = idOf.get(path);
      if (!fileId) throw new Error(`A label names ${path}, which was not stored`);
      return { org_id: orgId, file_id: fileId, role, source: "model" };
    });
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await db.from("file_roles").insert(rows.slice(i, i + 1000));
      if (error) throw new Error(`Could not store labels: ${error.message}`);
    }

    timed(stage);
    await update({
      status: "complete",
      stage: null,
      stage_message: null,
      finished_at: new Date().toISOString(),
      adapter: result.adapter,
      coverage: toJson(result.coverage),
      routes_withheld: toJson(result.routesWithheld),
      file_count: result.files.length,
      package_count: new Set(result.files.flatMap((f) => f.package ?? [])).size,
    });
    await prune(db, request);
  } catch (error) {
    if (error instanceof Superseded) return;
    const reason = error instanceof Error ? error.message : String(error);
    // Half-stored rows go first, so a failed analysis never shows a partial graph.
    // Only this attempt's, and the failure is recorded only if the row is still ours.
    const { error: clearError } = await db.from("files").delete().eq("analysis_id", analysisId).eq("attempt", attempt);
    const { error: failError } = await db
      .from("analyses")
      .update({ status: "failed", stage, error: reason, finished_at: new Date().toISOString() })
      .eq("id", analysisId)
      .eq("attempt", attempt);
    if (clearError || failError) {
      console.error(`Analysis ${analysisId} failed in ${stage} (${reason}) and the failure could not be recorded:`, clearError ?? failError);
    }
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/**
 * Removes the repository's analyses beyond the most recent KEPT_ANALYSES.
 * Only called once this run is complete, so a run that fails never removes
 * anything; its own analysis is the newest and is never among those removed.
 * Everything an analysis owns, explanations included, goes with it by cascade.
 * By then the run has succeeded, so a failure here is logged, not turned into
 * a failed analysis; the next finished run removes what this one couldn't.
 */
async function prune(db: ReturnType<typeof createWriterSupabase>, request: RunRequest): Promise<void> {
  const { data, error } = await db
    .from("analyses")
    .select("id")
    .eq("project_id", request.projectId)
    .neq("id", request.analysisId)
    .order("created_at", { ascending: false })
    // Its own analysis is one of the kept, so the others keep one fewer.
    .range(KEPT_ANALYSES - 1, KEPT_ANALYSES + 99);
  if (error) {
    console.error(`Analysis ${request.analysisId}: could not list older analyses to remove: ${error.message}`);
    return;
  }
  if (data.length === 0) return;
  const removed = await db.from("analyses").delete().in("id", data.map((a) => a.id));
  if (removed.error) console.error(`Analysis ${request.analysisId}: could not remove ${data.length} older analyses: ${removed.error.message}`);
  else console.log(`Analysis ${request.analysisId}: removed ${data.length} analyses past the ${KEPT_ANALYSES} kept`);
}

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Names what the repository does hold, from the files actually extracted.
function noSourceFiles(extensions: Map<string, number>): string {
  const counts = [...extensions].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (counts.length === 0) return "No TypeScript or JavaScript files to parse; the archive holds no files at all";
  const shown = counts.slice(0, 3).map(([ext, n]) => `${formatCount(n)} ${ext}`);
  const rest = counts.slice(3).reduce((n, [, c]) => n + c, 0);
  return `No TypeScript or JavaScript files to parse; it has ${shown.join(", ")}${rest > 0 ? ` and ${formatCount(rest)} other files` : ""}`;
}

// The parser runs as its own process, exactly as it does from the terminal.
// It stays standalone, its CPU-bound work doesn't stall the server, and its
// output comes back through the contract reader like any other result.
// Its stdout is read only for the `progress <done> <total>` lines --progress adds.
async function parse(dir: string, out: string, progress: (done: number, total: number) => void): Promise<ParseResult> {
  const cli = path.join(process.cwd(), "parser", "cli.ts");
  let timedOut = false;
  const { code, stderr } = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, dir, "--out", out, "--progress"], { stdio: ["ignore", "pipe", "pipe"] });
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PARSE_DEADLINE_MS);
    let partial = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const lines = (partial + chunk).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^progress (\d+) (\d+)$/.exec(line);
        if (match) progress(Number(match[1]), Number(match[2]));
      }
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      resolve({ code, stderr });
    });
  });
  if (timedOut) throw new Error(`The parser was stopped after ${PARSE_DEADLINE_MS / 60000} minutes without finishing`);
  // Exit 1 means the result broke its own invariants (files that don't add up,
  // edges pointing at nothing). That is a failed run, not a graph to show.
  if (code === 1) throw new Error("The parser's result broke its own invariants, so it was not stored");
  if (code !== 0) {
    const last = stderr.trim().split("\n").at(-1);
    throw new Error(`The parser exited with code ${code}${last ? `: ${last}` : ""}`);
  }
  return readParseResult(out);
}
