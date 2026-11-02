import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TablesUpdate } from "@/lib/database.types";
import { createWriterSupabase } from "@/lib/supabase";
import { formatCount, type AnalysisStage } from "@/lib/stages";
import { readParseResult } from "@/parser/io";
import type { ParseResult } from "@/parser/types";
import { downloadArchive, resolveCommit, selectFiles, type RepoRef } from "./github";
import { storeResult, toJson } from "./store";

export interface RunRequest {
  analysisId: string;
  projectId: string;
  /** Read off the verified Clerk token when the run was requested; the writer trusts nothing else. */
  orgId: string;
  repo: RepoRef;
  /** Null for the repository's default branch. */
  branch: string | null;
  /** The attempt this run claimed. Every write is checked against it. */
  attempt: number;
}

// The parser reports nothing while it works, so its deadline sits below the
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
  const enter = (next: AnalysisStage, message: string) => {
    stage = next;
    return update({ status: "running", stage: next, stage_message: message });
  };

  try {
    await enter("fetching", `Looking up ${slug} on GitHub`);
    // A re-run starts from nothing: rows from the previous run would otherwise
    // sit beside the new ones. Edges, imports and roles go with their files.
    // Only earlier attempts' files, so a run that lost its claim can't clear its successor's.
    {
      const { error } = await db.from("files").delete().eq("analysis_id", analysisId).lt("attempt", attempt);
      if (error) throw new Error(`Could not clear the previous run's files: ${error.message}`);
    }
    for (const table of ["insights", "routes"] as const) {
      const { error } = await db.from(table).delete().eq("analysis_id", analysisId);
      if (error) throw new Error(`Could not clear the previous run's ${table}: ${error.message}`);
    }

    const commit = await resolveCommit(repo, request.branch);
    await update({ branch: commit.branch, commit_sha: commit.sha });
    {
      const { error } = await db.from("projects").update({ description: commit.description }).eq("id", request.projectId);
      if (error) throw new Error(`Could not record the description: ${error.message}`);
    }
    await enter("fetching", `Downloading ${slug}@${commit.sha.slice(0, 7)} (${commit.branch})`);
    const archive = path.join(work, "archive.tar.gz");
    const bytes = await downloadArchive(repo, commit.sha, archive);

    await enter("selecting", `Extracting ${bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`} archive`);
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
    const result = await parse(dir, path.join(work, "result.json"));
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
    await storeResult(db, { analysisId, orgId, attempt }, result, (message) => update({ stage_message: message }));

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
async function parse(dir: string, out: string): Promise<ParseResult> {
  const cli = path.join(process.cwd(), "parser", "cli.ts");
  let timedOut = false;
  const { code, stderr } = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, dir, "--out", out], { stdio: ["ignore", "ignore", "pipe"] });
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PARSE_DEADLINE_MS);
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
