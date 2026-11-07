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
  /** The branch asked for, or the default one. Null when a commit hash was asked for: it may be on any number of branches. */
  branch: string | null;
  sha: string;
  description: string | null;
  /** The repository's default branch as GitHub names it now, whatever was asked for. */
  defaultBranch: string;
}

// Short hashes below seven characters are too likely to match several commits.
const COMMIT_HASH = /^[0-9a-f]{7,40}$/i;

/**
 * Which commit to analyse: the tip of a branch, a commit given by its hash, or
 * the tip of the default branch when `ref` is null. A name is tried as a
 * branch first, the way git reads a ref, so a branch that happens to look like
 * a hash is still the branch.
 */
export async function resolveCommit(repo: RepoRef, ref: string | null): Promise<ResolvedCommit> {
  const slug = `${repo.owner}/${repo.name}`;
  const info = await github(`/repos/${slug}`, `github.com/${slug} doesn't exist or isn't public`);
  const body: unknown = await info.json();
  const defaultBranch = field(body, "default_branch");
  if (typeof defaultBranch !== "string") throw new Error(`GitHub's answer for ${slug} has no default branch`);
  const rawDescription = field(body, "description");
  const description = typeof rawDescription === "string" && rawDescription.trim() ? rawDescription.trim() : null;

  const wanted = ref ?? defaultBranch;
  const tip = await branchHead(repo, wanted);
  if (tip) return { branch: wanted, sha: tip, description, defaultBranch };
  if (ref === null || !COMMIT_HASH.test(ref)) throw new Error(`${slug} has no branch named "${wanted}"`);
  return { branch: null, sha: await commitSha(repo, ref), description, defaultBranch };
}

/** The full hash of a commit given by a full or short hash. GitHub answers 422 for one it doesn't have. */
async function commitSha(repo: RepoRef, hash: string): Promise<string> {
  const slug = `${repo.owner}/${repo.name}`;
  // This media type answers with the bare hash, not the whole commit and its diff.
  const res = await github(`/repos/${slug}/commits/${hash}`, `${slug} has no branch or commit named "${hash}"`, {
    Accept: "application/vnd.github.sha",
  });
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`GitHub's answer for commit ${hash} of ${slug} isn't a commit hash`);
  return sha;
}

/**
 * The commit `branch` points at now, asked the way `git ls-remote` asks:
 * git's own protocol (v2 ls-refs), not the REST API. It is checked every time
 * a map or the repositories list opens, and the 60-an-hour API allowance is
 * kept for what only the API can answer.
 */
export async function headCommit(repo: RepoRef, branch: string): Promise<string> {
  const sha = await branchHead(repo, branch);
  if (!sha) throw new Error(`${repo.owner}/${repo.name} has no branch named "${branch}"`);
  return sha;
}

/** The tip of `branch`, or null when there is no such branch. */
async function branchHead(repo: RepoRef, branch: string): Promise<string | null> {
  const slug = `${repo.owner}/${repo.name}`;
  const ref = `refs/heads/${branch}`;
  const pkt = (line: string) => (Buffer.byteLength(line) + 4).toString(16).padStart(4, "0") + line;
  const res = await fetch(`https://github.com/${slug}.git/git-upload-pack`, {
    method: "POST",
    headers: {
      "User-Agent": "lumina",
      "Git-Protocol": "version=2",
      "Content-Type": "application/x-git-upload-pack-request",
      Accept: "application/x-git-upload-pack-result",
    },
    // "0001" separates the command from its arguments, "0000" ends the request.
    body: `${pkt("command=ls-refs\n")}0001${pkt(`ref-prefix ${ref}\n`)}0000`,
  });
  // GitHub answers 401 rather than 404 for a repository that is missing or private.
  if (res.status === 401 || res.status === 404) throw new Error(`github.com/${slug} doesn't exist or isn't public`);
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status} when asked for ${slug}@${branch}`);
  // Each line is a 4-digit length, then "<sha> <ref>". The prefix also matches
  // longer names (main matches main-v2), so only the exact ref counts.
  for (const line of (await res.text()).split("\n")) {
    const m = /^[0-9a-f]{4}([0-9a-f]{40}) (.+)$/.exec(line);
    if (m && m[2] === ref) return m[1];
  }
  return null;
}

/**
 * One file's bytes at `ref`, or null when the file doesn't exist there. Served
 * from GitHub's raw host, which the 60-an-hour API limit doesn't cover.
 */
export async function fileAt(repo: RepoRef, ref: string, file: string): Promise<Buffer | null> {
  const encoded = file.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${encodeURIComponent(ref)}/${encoded}`, {
    headers: { "User-Agent": "lumina" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status} for ${file}@${ref.slice(0, 12)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Downloads the archive of exactly `sha`, so what is parsed is the commit recorded. */
export async function downloadArchive(repo: RepoRef, sha: string, file: string, received?: (bytes: number) => void): Promise<number> {
  const res = await fetch(`https://codeload.github.com/${repo.owner}/${repo.name}/tar.gz/${sha}`, {
    headers: { "User-Agent": "lumina" },
  });
  if (res.status === 404) throw new Error(`GitHub has no archive of ${repo.owner}/${repo.name} at ${sha.slice(0, 7)}`);
  if (!res.ok || !res.body) throw new Error(`GitHub refused the archive download: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_ARCHIVE_BYTES) throw new Error(`The archive is ${mb(declared)}; the limit is ${mb(MAX_ARCHIVE_BYTES)}`);

  // Content-Length is often absent for archives, so the limit is also counted as bytes arrive.
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) done(new Error(`The archive is larger than the ${mb(MAX_ARCHIVE_BYTES)} limit`));
      else {
        received?.(bytes);
        done(null, chunk);
      }
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
