import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fileAt, type RepoRef } from "@/lib/pipeline/github";
import { ai, cacheKey, cachedCall, MODEL, type Cached } from "./client";

// The model explains what the parser found. Every path it sees is handed to
// it from the stored graph, and it is told the lists are complete, so there is
// nothing for it to walk and no connection for it to supply.

type Db = SupabaseClient<Database>;

// Three pieces of formatting are allowed and rendered. Forbidding all of it
// doesn't hold: models write backticks anyway, and they arrive as backticks.
// Headings are out because the pane is narrow and they chop a few short
// paragraphs into labelled fragments.
const FORMAT = `Formatting: plain paragraphs. Only three kinds of markup are allowed: inline code in single backticks, bullet lines starting with "- ", and bold in double asterisks. No headings, tables, numbered lists, italics or links. Write every repository path in full, exactly as given, inside inline code, and name only paths you were given.`;

const FILE_PROMPT = `You explain one file of a TypeScript or JavaScript repository to a developer reading a map of its dependencies.

Say what the file does and the part it plays among the files around it: what it takes from the files it imports, and what the files importing it use it for. The neighbour lists come from a parser and are complete. Don't add connections that aren't listed, and don't speculate about files you weren't shown.

Describe, don't review: no judgements of quality, no suggestions, no ratings. Keep it short: two or three short paragraphs, or a paragraph and a few bullets.

${FORMAT}`;

const FOLDER_PROMPT = `You explain one folder of a TypeScript or JavaScript repository to a developer reading a map of its dependencies.

Answer two things about the folder as a whole: what lives in it, and why the rest of the repository points at it, meaning what other folders come to it for. This is about the folder, not a summary of any one file in it. The file list and the import counts come from a parser and are complete. Don't add connections that aren't listed.

Describe, don't review: no judgements of quality, no suggestions, no ratings. Keep it short: two or three short paragraphs, or a paragraph and a few bullets.

${FORMAT}`;

// Past this the source is cut, and the model is told it was.
const SOURCE_LINES = 1500;
const SOURCE_CHARS = 60_000;

export interface FileSubject {
  repo: RepoRef;
  /** The analysed commit: the source is read from exactly here. */
  commit: string;
  path: string;
  sha256: string;
  role: string | null;
  imports: string[];
  importedBy: string[];
  externals: string[];
}

export interface FolderFile {
  path: string;
  sha256: string;
  role: string | null;
  lines: number | null;
  fanIn: number;
  fanOut: number;
  /** Importers outside this folder, counted per folder on the map. */
  importedFrom: { folder: string; count: number }[];
}

export interface FolderSubject {
  repo: RepoRef;
  folder: string;
  files: FolderFile[];
  /** Imports leaving the folder, counted per folder on the map. */
  importsFrom: { folder: string; count: number }[];
  /** Imports between files inside the folder. */
  internal: number;
}

// The file's content hash stands in for its source, so a hit needs no fetch.
const fileKey = (s: FileSubject) =>
  cacheKey({ prompt: FILE_PROMPT, path: s.path, sha256: s.sha256, role: s.role, imports: s.imports, importedBy: s.importedBy, externals: s.externals });

const folderKey = (s: FolderSubject) => cacheKey({ prompt: FOLDER_PROMPT, folder: s.folder, files: s.files, importsFrom: s.importsFrom, internal: s.internal });

/** Cache reads go through the member's own client, so the policy decides which rows exist. Writes go through the writer. */
export interface ExplainDbs {
  reader: Db;
  writer: Db;
  orgId: string;
}

function cache<S>(dbs: ExplainDbs, keyOf: (s: S) => string) {
  return {
    async read(s: S) {
      const { data, error } = await dbs.reader.from("explanations").select("body").eq("model", MODEL).eq("key", keyOf(s)).maybeSingle();
      if (error) throw new Error(`Could not read the cached explanation: ${error.message}`);
      return data?.body ?? null;
    },
    async write(s: S, body: string) {
      const { error } = await dbs.writer
        .from("explanations")
        .upsert({ org_id: dbs.orgId, model: MODEL, key: keyOf(s), body }, { onConflict: "org_id,model,key", ignoreDuplicates: true });
      if (error) throw new Error(`Could not cache the explanation: ${error.message}`);
    },
  };
}

export function explainFile(dbs: ExplainDbs, subject: FileSubject): Promise<Cached<string>> {
  return cachedCall<FileSubject, string>("explain file", {
    ...cache(dbs, fileKey),
    async generate(s) {
      const bytes = await fileAt(s.repo, s.commit, s.path);
      if (bytes === null) throw new Error(`${s.path} is not in GitHub at the analysed commit ${s.commit.slice(0, 7)}`);
      // The source must be exactly what was parsed, or the explanation would describe another file.
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== s.sha256) throw new Error(`${s.path} from GitHub doesn't match what was parsed at ${s.commit.slice(0, 7)}`);
      const source = cut(bytes.toString("utf8"));
      const list = (paths: string[]) => (paths.length > 0 ? paths.map((p) => `- \`${p}\``).join("\n") : "none");
      return complete(
        FILE_PROMPT,
        [
          `Repository: ${s.repo.owner}/${s.repo.name}`,
          `File: \`${s.path}\`${s.role ? ` (role: ${s.role})` : ""}`,
          `Repository files it imports (${s.imports.length}):\n${list(s.imports)}`,
          `Repository files that import it (${s.importedBy.length}):\n${list(s.importedBy)}`,
          `Packages it imports: ${s.externals.length > 0 ? s.externals.join(", ") : "none"}`,
          source.cut ? `Source (first ${source.lines} of ${source.total} lines):` : "Source:",
          "```",
          source.text,
          "```",
        ].join("\n\n"),
      );
    },
  })(subject);
}

export function explainFolder(dbs: ExplainDbs, subject: FolderSubject): Promise<Cached<string>> {
  return cachedCall<FolderSubject, string>("explain folder", {
    ...cache(dbs, folderKey),
    async generate(s) {
      const counts = (list: { folder: string; count: number }[]) =>
        list.length > 0 ? list.map((c) => `\`${c.folder === "." ? "./" : `${c.folder}/`}\` ${c.count}`).join(", ") : "none";
      const files = s.files.map((f) =>
        [
          `- \`${f.path}\``,
          f.role ? ` role: ${f.role};` : "",
          f.lines !== null ? ` ${f.lines} lines;` : "",
          ` imported by ${f.fanIn}, imports ${f.fanOut}`,
          f.importedFrom.length > 0 ? `; importers outside the folder by folder: ${counts(f.importedFrom)}` : "",
        ].join(""),
      );
      return complete(
        FOLDER_PROMPT,
        [
          `Repository: ${s.repo.owner}/${s.repo.name}`,
          `Folder: \`${s.folder === "." ? "./" : `${s.folder}/`}\` (${s.files.length} files, ${s.internal} imports between them)`,
          `Files:\n${files.join("\n")}`,
          `Imports from other folders into this one, by folder: ${counts(aggregate(s.files.flatMap((f) => f.importedFrom)))}`,
          `Imports from this folder into other folders, by folder: ${counts(s.importsFrom)}`,
        ].join("\n\n"),
      );
    },
  })(subject);
}

async function complete(prompt: string, input: string): Promise<string> {
  const completion = await ai.chat.completions.create({
    model: MODEL,
    reasoning_effort: "low",
    messages: [
      { role: "developer", content: prompt },
      { role: "user", content: input },
    ],
  });
  const body = completion.choices[0]?.message.content?.trim();
  if (!body) throw new Error(`The model returned no explanation (finish reason: ${completion.choices[0]?.finish_reason ?? "none"})`);
  return body;
}

function cut(text: string): { text: string; cut: boolean; lines: number; total: number } {
  const all = text.split("\n");
  const kept = all.slice(0, SOURCE_LINES).join("\n").slice(0, SOURCE_CHARS);
  const lines = kept.split("\n").length;
  return { text: kept, cut: kept.length < text.length, lines, total: all.length };
}

export function aggregate(list: { folder: string; count: number }[]): { folder: string; count: number }[] {
  const by = new Map<string, number>();
  for (const { folder, count } of list) by.set(folder, (by.get(folder) ?? 0) + count);
  return [...by].map(([folder, count]) => ({ folder, count })).sort((a, b) => b.count - a.count || (a.folder < b.folder ? -1 : 1));
}
