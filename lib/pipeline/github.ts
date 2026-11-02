import fs from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";

// Public repositories only, fetched anonymously. No token is requested, sent
// or stored, so GitHub's unauthenticated limits apply and are reported as such.

const API = "https://api.github.com";
const HEADERS = { "User-Agent": "lumina", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

// Past this the run would spend minutes downloading something it can't parse
// in a request anyway. Stated as a limit rather than worked around.
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
// The compressed limit says nothing about what comes out: an archive that is
// mostly repetition expands without bound. So extraction has its own budget,
// counted from each entry's header before a byte of it is written.
const MAX_EXTRACTED_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 500_000;

export interface RepoRef {
  owner: string;
  name: string;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Accepts owner/name, a github.com URL (with or without scheme, .git, or a
 * trailing path) and the SSH form. Lower-cased, because GitHub names are
 * case-insensitive and "one analysis per repository" has to hold however the
 * URL was typed. A /tree/… suffix is ignored rather than read as a branch: it
 * can't be split into branch and folder without guessing.
 */
export function parseRepoInput(input: string): RepoRef | null {
  let rest = input.trim();
  rest = rest.replace(/^git@github\.com:/i, "");
  rest = rest.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "");
  const [owner, rawName] = rest.split("/");
  const name = rawName?.replace(/\.git$/i, "");
  if (!owner || !name || !OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..") return null;
  return { owner: owner.toLowerCase(), name: name.toLowerCase() };
}

export interface ResolvedCommit {
  branch: string;
  sha: string;
  description: string | null;
}

/** Which commit the archive will come from: the tip of `branch`, or of the default branch. */
export async function resolveCommit(repo: RepoRef, branch: string | null): Promise<ResolvedCommit> {
  const slug = `${repo.owner}/${repo.name}`;
  const info = await github(`/repos/${slug}`, `github.com/${slug} doesn't exist or isn't public`);
  const body: unknown = await info.json();
  const defaultBranch = field(body, "default_branch");
  if (typeof defaultBranch !== "string") throw new Error(`GitHub's answer for ${slug} has no default branch`);
  const description = field(body, "description");

  const ref = branch ?? defaultBranch;
  const commit = await github(
    `/repos/${slug}/commits/${encodeURIComponent(ref)}`,
    `${slug} has no branch named "${ref}"`,
    { Accept: "application/vnd.github.sha" },
  );
  const sha = (await commit.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`GitHub returned "${sha.slice(0, 60)}" instead of a commit for ${slug}@${ref}`);
  return { branch: ref, sha, description: typeof description === "string" && description.trim() ? description.trim() : null };
}

/** Downloads the archive of exactly `sha`, so what is parsed is the commit recorded. */
export async function downloadArchive(repo: RepoRef, sha: string, file: string): Promise<number> {
  const res = await fetch(`https://codeload.github.com/${repo.owner}/${repo.name}/tar.gz/${sha}`, {
    headers: { "User-Agent": "lumina" },
  });
  if (!res.ok || !res.body) throw new Error(`GitHub refused the archive download: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_ARCHIVE_BYTES) throw new Error(`The archive is ${mb(declared)}; the limit is ${mb(MAX_ARCHIVE_BYTES)}`);

  // Content-Length is often absent for archives, so the limit is also counted as bytes arrive.
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) done(new Error(`The archive is larger than the ${mb(MAX_ARCHIVE_BYTES)} limit`));
      else done(null, chunk);
    },
  });
  await pipeline(Readable.from(chunks(res.body)), counter, fs.createWriteStream(file));
  return bytes;
}

export interface Selection {
  files: number;
  /** Extracted files per extension ("(none)" for none), so a run can say what a repository holds. */
  extensions: Map<string, number>;
  /** Repository-relative paths of links in the archive, which are not extracted. */
  links: string[];
}

/**
 * Extracts regular files and directories. Links are left out — the parser
 * never follows them either — but each one is returned so it can be reported
 * exactly as the walk would have reported it, rather than vanishing.
 */
export async function selectFiles(archive: string, dir: string): Promise<Selection> {
  const selection: Selection = { files: 0, extensions: new Map(), links: [] };
  let entries = 0;
  let extracted = 0;
  const extractor = tar.x({
    cwd: dir,
    // GitHub wraps everything in one owner-name-sha directory.
    strip: 1,
    filter: (entryPath, entry) => {
      if (!("type" in entry)) return false;
      entries += 1;
      if (entry.type !== "SymbolicLink" && entry.type !== "Link") extracted += entry.size;
      if (entries > MAX_ENTRIES || extracted > MAX_EXTRACTED_BYTES) {
        const over = entries > MAX_ENTRIES ? `more than ${MAX_ENTRIES} entries` : `more than ${mb(MAX_EXTRACTED_BYTES)} once extracted`;
        extractor.abort(new Error(`The archive holds ${over}; that is the limit`));
        return false;
      }
      // The filter sees the path before the wrapper directory is stripped.
      const rel = entryPath.split("/").slice(1).join("/").replace(/\/$/, "");
      switch (entry.type) {
        case "Directory":
          return true;
        case "File":
        case "OldFile":
        case "ContiguousFile": {
          selection.files += 1;
          const ext = /\.[^./]+$/.exec(rel)?.[0].toLowerCase() ?? "(none)";
          selection.extensions.set(ext, (selection.extensions.get(ext) ?? 0) + 1);
          return true;
        }
        case "SymbolicLink":
        case "Link":
          if (rel) selection.links.push(rel);
          return false;
        default:
          return false;
      }
    },
  });
  await pipeline(fs.createReadStream(archive), extractor);
  selection.links.sort();
  return selection;
}

// Read through the reader rather than Readable.fromWeb, whose types don't meet the DOM stream fetch returns.
async function* chunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

async function github(route: string, notFound: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(`${API}${route}`, { headers: { ...HEADERS, ...headers } });
  if (res.ok) return res;
  if (res.status === 404 || res.status === 422) throw new Error(notFound);
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const at = Number.isFinite(reset) && reset > 0 ? ` It resets at ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC.` : "";
    throw new Error(`GitHub's limit for anonymous requests (60 an hour) is used up.${at}`);
  }
  throw new Error(`GitHub answered HTTP ${res.status} for ${route}`);
}

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null ? Reflect.get(body, key) : undefined;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
