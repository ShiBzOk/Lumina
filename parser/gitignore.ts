// What counts as "the repository" is what git would track, so the walk honours
// .gitignore files. This is the subset of gitignore syntax that real projects
// use: globs, **, anchoring, directory-only patterns and negation.

export interface IgnoreRule {
  /** Repository-relative directory holding the .gitignore, "" at the root. */
  base: string;
  /** Where the rule came from, for reporting: ".gitignore:12". */
  source: string;
  pattern: string;
  negate: boolean;
  dirOnly: boolean;
  /** Patterns containing a slash match the whole path; others match the name at any depth. */
  anchored: boolean;
  regex: RegExp;
}

export function parseGitignore(text: string, base: string): IgnoreRule[] {
  const file = base ? `${base}/.gitignore` : ".gitignore";
  const rules: IgnoreRule[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw.replace(/(?<!\\)\s+$/, "");
    if (!line || line.startsWith("#")) return;
    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    } else if (line.startsWith("\\!") || line.startsWith("\\#")) {
      line = line.slice(1);
    }
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    if (!line) return;
    rules.push({
      base,
      source: `${file}:${index + 1}`,
      pattern: raw.trim(),
      negate,
      dirOnly,
      anchored,
      regex: globToRegex(line),
    });
  });
  return rules;
}

/** The rule that ignores this path, or null if it is kept. Last match wins, as in git. */
export function matchIgnore(rules: readonly IgnoreRule[], path: string, isDir: boolean): IgnoreRule | null {
  let hit: IgnoreRule | null = null;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.base && !path.startsWith(`${rule.base}/`)) continue;
    const sub = rule.base ? path.slice(rule.base.length + 1) : path;
    const subject = rule.anchored ? sub : sub.slice(sub.lastIndexOf("/") + 1);
    if (rule.regex.test(subject)) hit = rule;
  }
  return hit && !hit.negate ? hit : null;
}

function globToRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end === -1) {
        re += "\\[";
      } else {
        let cls = glob.slice(i + 1, end).replace(/\\/g, "\\\\");
        if (cls.startsWith("!")) cls = `^${cls.slice(1)}`;
        re += `[${cls}]`;
        i = end;
      }
    } else if (c === "\\" && i + 1 < glob.length) {
      re += escapeRegex(glob[i + 1]);
      i += 1;
    } else {
      re += escapeRegex(c);
    }
  }
  return new RegExp(`^${re}$`);
}

function escapeRegex(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
