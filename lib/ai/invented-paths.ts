// The invented-path check. Every path-shaped token in an explanation is looked
// up in the set of paths the model was shown; anything not in it was invented.
// Deterministic on purpose: this is set membership with an exact answer, and a
// model grading a model for hallucinations would be a hallucination detector
// that hallucinates.
//
// "Shown" is read from the exact text handed to the model, source included,
// with the same tokenizer as the answer. So a relative import the model quotes
// from the source counts as shown, and nothing is decided by a second list
// that could drift from the prompt.

// What a path can be made of. No spaces, quotes, backticks, colons or commas,
// so `lib/a.ts:42`, "lib/a.ts", and lists split cleanly.
const RUN = /[\w@.\-\[\]()+~$/]+/g;

// A URL is not a repository path, and its slashes would make it look like one.
const URL = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

// Extensions a repository file the map could show is likely to carry.
const EXTENSION = /\.(?:[cm]?[jt]sx?|json|css|scss|sass|less|md|mdx|ya?ml|html|svg|vue|svelte|graphql|gql|sql|png|jpe?g|gif|webp|ico)$/i;

// "Next.js", "Node.js", "Express.js": a product name, not a file. A capitalised
// single word with no slash is never how a repository path is written here.
const PRODUCT = /^[A-Z][A-Za-z]*\.js$/;

/** Trims sentence punctuation and brackets that don't belong to the token, then one leading "./" and trailing "/". */
function normalise(raw: string): string {
  let t = raw;
  for (;;) {
    const before = t;
    t = t.replace(/[.,;!?]+$/, "");
    if (t.endsWith(")") && count(t, "(") < count(t, ")")) t = t.slice(0, -1);
    if (t.endsWith("]") && count(t, "[") < count(t, "]")) t = t.slice(0, -1);
    if (t.startsWith("(") && count(t, "(") > count(t, ")")) t = t.slice(1);
    if (t.startsWith("[") && count(t, "[") > count(t, "]")) t = t.slice(1);
    if (t === before) break;
  }
  return t.replace(/^\.\//, "").replace(/\/+$/, "");
}

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

function tokens(text: string): string[] {
  return (text.replace(URL, " ").match(RUN) ?? []).map(normalise).filter((t) => t.length > 0);
}

/**
 * Whether a token is written like a path. A file extension or a "./" start is
 * enough. A slash alone isn't: models write `request/response` and
 * "products/collections/menus" as word lists, and flagging those would be a
 * failure nobody could confirm. So a token with slashes and no extension
 * counts when it starts from a folder some shown path starts from, which is
 * what claiming a place in this repository looks like. In running text it
 * also needs a trailing slash, because prose writes "client/server" and
 * "fetches products/collections/menus" even when those are real folders.
 */
function pathShaped(raw: string, token: string, inCode: boolean, roots: ReadonlySet<string>): boolean {
  if (!/[A-Za-z0-9]/.test(token) || PRODUCT.test(token)) return false;
  if (EXTENSION.test(token) && !token.startsWith(".")) return true;
  if (raw.startsWith("./") || raw.startsWith("../")) return true;
  const slashes = count(token, "/");
  if (slashes === 0 || !roots.has(token.split("/")[0])) return false;
  return inCode || /\/[.,;!?)\]]*$/.test(raw);
}

/** Every path-shaped token in an answer, once each. Inline code and running text are both read. */
function pathTokens(answer: string, roots: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  const code = /`([^`]+)`/g;
  let at = 0;
  const scan = (text: string, inCode: boolean) => {
    for (const raw of text.replace(URL, " ").match(RUN) ?? []) {
      const token = normalise(raw);
      if (token && pathShaped(raw, token, inCode, roots)) found.add(token);
    }
  };
  for (let m = code.exec(answer); m; m = code.exec(answer)) {
    scan(answer.slice(at, m.index), false);
    scan(m[1], true);
    at = m.index + m[0].length;
  }
  scan(answer.slice(at), false);
  return [...found];
}

/**
 * The paths the model was shown: every token in its input, every folder above
 * one, and every file's name on its own, since naming `client.ts` for a shown
 * `lib/ai/client.ts` is shortening, not inventing.
 */
export function shownPaths(input: string): Set<string> {
  const shown = new Set<string>();
  for (const token of tokens(input)) {
    shown.add(token);
    const parts = token.split("/");
    for (let i = 1; i < parts.length; i++) shown.add(parts.slice(0, i).join("/"));
    shown.add(parts[parts.length - 1]);
  }
  return shown;
}

/**
 * Path-shaped tokens in the answer that the input never showed. Empty means
 * nothing was invented. A token with no extension also counts as shown when
 * adding a shown file's extension makes it exact: `src/shared/util` for a
 * shown `src/shared/util.ts` is how an import names a real file. The reverse
 * isn't forgiven: `constants.js` for a shown `constants.ts` names a file that
 * doesn't exist.
 */
export function inventedPaths(input: string, answer: string): string[] {
  const shown = shownPaths(input);
  const extensionless = new Set([...shown].filter((p) => EXTENSION.test(p)).map((p) => p.replace(EXTENSION, "")));
  const roots = new Set(tokens(input).filter((t) => t.includes("/")).map((t) => t.split("/")[0]));
  return pathTokens(answer, roots).filter((t) => !shown.has(t) && (EXTENSION.test(t) || !extensionless.has(t)));
}

export interface Repair {
  /** The answer with every invented path rewritten or its sentence removed. */
  body: string;
  /** Invented paths that meant exactly one shown file, and the file they now name. */
  rewritten: { from: string; to: string }[];
  /** Invented paths that meant no shown file, or more than one; their sentences are gone. */
  removed: string[];
  /** How many sentences went with them, which is what the reader is told. */
  sentencesRemoved: number;
}

/**
 * The pass after the model answers. An invented path that can only mean one
 * file the model was shown is rewritten to that file: the same path with
 * another extension (`constants.js` written for a shown `constants.ts`, which
 * is how ESM import specifiers spell it), or the tail of exactly one shown
 * path. Anything else isn't guessed at: the sentence naming it is removed,
 * because absent beats approximate. Set membership decides both, as it does
 * for the check.
 */
export function repairPaths(input: string, answer: string): Repair {
  const invented = inventedPaths(input, answer);
  if (invented.length === 0) return { body: answer, rewritten: [], removed: [], sentencesRemoved: 0 };

  const files = [...new Set(tokens(input))].filter((t) => t.includes("/") && EXTENSION.test(t));
  const rewritten: Repair["rewritten"] = [];
  let body = answer;
  for (const from of invented) {
    const stem = from.replace(EXTENSION, "");
    const sameStem = files.filter((f) => f.replace(EXTENSION, "") === stem);
    const tail = files.filter((f) => f.endsWith(`/${from}`));
    const only = sameStem.length === 1 ? sameStem[0] : sameStem.length === 0 && tail.length === 1 ? tail[0] : null;
    if (only === null) continue;
    body = replaceToken(body, from, only);
    rewritten.push({ from, to: only });
  }

  const left = inventedPaths(input, body);
  let sentencesRemoved = 0;
  const names = (texts: readonly string[]) => (text: string) => {
    const hit = texts.some((t) => tokens(text).includes(t));
    if (hit) sentencesRemoved += 1;
    return hit;
  };
  body = withoutSentences(body, names(left));
  // Whatever a sentence split couldn't isolate goes with its whole line, counted as one.
  const stubborn = inventedPaths(input, body);
  if (stubborn.length > 0) body = withoutLines(body, names(stubborn));
  return { body, rewritten, removed: left, sentencesRemoved };
}

/** Swaps a path everywhere it is written as a whole token, keeping any "./" or punctuation around it. */
function replaceToken(text: string, from: string, to: string): string {
  return text.replace(RUN, (raw) => (normalise(raw) === from ? raw.replace(from, to) : raw));
}

/** Drops the sentences `drop` matches, and any bullet or paragraph left empty. */
function withoutSentences(text: string, drop: (sentence: string) => boolean): string {
  const lines = text.split(/\r?\n/).map((line) => {
    const bullet = /^(\s*[-*•]\s+)/.exec(line)?.[1] ?? "";
    const kept = line
      .slice(bullet.length)
      .split(/(?<=[.!?])\s+(?=\S)/)
      .filter((s) => !drop(s));
    return kept.length === 0 ? null : bullet + kept.join(" ");
  });
  return tidy(lines);
}

function withoutLines(text: string, drop: (line: string) => boolean): string {
  return tidy(text.split(/\r?\n/).map((line) => (drop(line) ? null : line)));
}

// A removed line leaves no gap: blank runs collapse to one paragraph break.
function tidy(lines: (string | null)[]): string {
  return lines
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
