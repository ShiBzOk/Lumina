"use client";

import { useState, type ReactNode } from "react";
import { coverageFigure } from "@/lib/map/coverage";
import { formatCount } from "@/lib/stages";
import type { Coverage, SkipReason, UnresolvedGroup, UnresolvedReason } from "@/parser/types";
import { Icon } from "./icons";

// What each reason means, said plainly. Each says only what the parser
// established, never why the repository is that way: a missing target may be
// build output or may just be missing, and nothing here can tell which. The
// parser's own name for the reason stays on hover.
const UNRESOLVED_LABEL: Record<UnresolvedReason, string> = {
  "alias-target-missing": "Through a path alias",
  "workspace-entry-missing": "To a workspace package's entry point",
  "file-not-found": "Through a relative path",
  "undeclared-package": "Name a package no package.json declares",
  "non-literal-specifier": "Build the path while the code runs",
  "extension-required": "Leave out an extension their config requires",
  "not-in-walk": "Reach a file that wasn't listed when the repository was read",
};
const SKIP_LABEL: Record<SkipReason, string> = {
  "too-large": "Too large",
  binary: "Not text",
  minified: "Minified",
  unreadable: "Couldn't be opened",
};

// Grouped by where the import leads rather than by what the parser tried, so
// the list reads as a description of the repository, not a list of failures.
const MISSING: readonly UnresolvedReason[] = ["alias-target-missing", "workspace-entry-missing", "file-not-found"];
const EXAMPLES = 3;

// One shade per share, darkest for what is drawn. Grey rather than hue: the
// map's colours already mean file types and directions, and none of these is
// one of those.
const SHADE = {
  drawn: "bg-foreground/75",
  missing: "bg-foreground/30",
  unsettled: "bg-foreground/15",
  excluded: "bg-foreground/[0.07]",
} as const;
type Share = { key: keyof typeof SHADE; label: string; count: number };

// Says the map is partial whenever it is. It starts as one line that still
// names the figure and can't be dismissed, so a map that is quietly
// incomplete can never look complete.
export function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const [open, setOpen] = useState(false);
  const figure = coverageFigure(coverage);
  if (!figure.partial) return null;

  const missing = coverage.unresolved.filter((g) => MISSING.includes(g.reason));
  const unsettled = coverage.unresolved.filter((g) => !MISSING.includes(g.reason));
  // Every import pointing inside the repository lands in exactly one of these,
  // so together they are the whole bar. Skipped files are files, not imports,
  // and are listed beside it rather than added in.
  const shares: Share[] = [
    { key: "drawn", label: "Drawn", count: figure.resolved },
    { key: "missing", label: "Lead to files not in the repository", count: sum(missing) },
    { key: "unsettled", label: "Can't be followed from the files alone", count: sum(unsettled) },
    { key: "excluded", label: "Reach files left out on purpose", count: coverage.imports.excluded },
  ];
  const skippedByReason = Map.groupBy(coverage.skipped, (s) => s.reason);

  return (
    <section className="shrink-0 border-b border-border bg-surface text-[11px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-background"
      >
        <Icon name="info" className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 truncate">
          This map draws <span className="font-mono tabular-nums">{formatCount(figure.resolved)}</span> of the{" "}
          <span className="font-mono tabular-nums">{formatCount(figure.intoRepo)}</span> imports that point inside the repository
        </span>
        <Bar shares={shares} total={figure.intoRepo} className="h-1.5 w-28 shrink-0" />
        <span className="shrink-0 font-mono text-muted tabular-nums">{figure.percent.toFixed(1)}%</span>
        <span className="flex-1" />
        <span className="shrink-0 text-muted">{open ? "Hide" : "What's missing"}</span>
        <Icon name="chevronRight" className={`drop-chevron size-3.5 shrink-0 text-muted ${open ? "rotate-90" : ""}`} />
      </button>

      {/* Kept mounted so it can fold shut as well as open; hidden content is unreachable while shut. */}
      <div className="drop" data-open={open || undefined} inert={!open}>
        <div className="max-h-64 overflow-y-auto px-4 pt-1 pb-3 pl-[2.375rem]">
          <p className="text-muted">
            A link is drawn only when an import leads to a file Lumina read. The rest are counted here rather than guessed at.
          </p>

          <Bar shares={shares} total={figure.intoRepo} className="mt-2.5 h-2 w-full max-w-3xl" />
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {shares.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <Swatch shade={s.key} />
                <span>{s.label}</span>
                <span className="font-mono text-[10px] text-muted tabular-nums">{formatCount(s.count)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-x-8 gap-y-4">
            {missing.length > 0 && (
              <Group shade="missing" title="Lead to files not in the repository" note="The import names a path, and nothing is there.">
                <Reasons groups={missing} />
              </Group>
            )}
            {unsettled.length > 0 && (
              <Group
                shade="unsettled"
                title="Can't be followed from the files alone"
                note="Where these lead depends on a value at runtime, a package nobody declares, or a config rule."
              >
                <Reasons groups={unsettled} />
              </Group>
            )}
            {(coverage.imports.excluded > 0 || coverage.filesSkipped > 0) && (
              <Group shade="excluded" title="Left out on purpose" note="Real files Lumina doesn't read, such as ignored paths and minified code.">
                {coverage.imports.excluded > 0 && <Row label="Imports that reach one of them" count={coverage.imports.excluded} />}
                {[...skippedByReason].map(([reason, files]) => (
                  <Row key={reason} label={`${SKIP_LABEL[reason]}, so not read`} code={reason} count={files.length} unit="file">
                    {files.slice(0, EXAMPLES).map((f) => (
                      <Example key={f.path} title={f.detail}>
                        {f.path}
                      </Example>
                    ))}
                  </Row>
                ))}
              </Group>
            )}
            {coverage.syntaxErrors.length > 0 && (
              <Group title="Read despite syntax errors" note="Their imports may be incomplete.">
                <Row label="Files" count={coverage.syntaxErrors.length} unit="file">
                  {coverage.syntaxErrors.slice(0, EXAMPLES).map((s) => (
                    <Example key={s.path}>{s.path}</Example>
                  ))}
                </Row>
              </Group>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const sum = (groups: UnresolvedGroup[]) => groups.reduce((n, g) => n + g.count, 0);

/** Each share as a width of the whole. A share that exists never draws narrower than a hairline. */
function Bar({ shares, total, className }: { shares: Share[]; total: number; className: string }) {
  return (
    <span className={`flex gap-px overflow-hidden rounded-full bg-background ${className}`} aria-hidden>
      {shares.map((s) =>
        s.count > 0 ? <span key={s.key} className={`${SHADE[s.key]} min-w-0.5`} style={{ flexGrow: s.count, flexBasis: 0 }} /> : null,
      )}
      {total === 0 && <span className="flex-1" />}
    </span>
  );
}

function Swatch({ shade }: { shade: keyof typeof SHADE }) {
  return <span className={`size-2 shrink-0 rounded-sm ${SHADE[shade]}`} aria-hidden />;
}

function Group({ shade, title, note, children }: { shade?: keyof typeof SHADE; title: string; note: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 font-medium">
        {shade && <Swatch shade={shade} />}
        {title}
      </p>
      <p className="mt-0.5 mb-1.5 text-[10.5px] text-muted">{note}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Reasons({ groups }: { groups: UnresolvedGroup[] }) {
  return groups.map((g) => (
    <Row key={g.reason} label={UNRESOLVED_LABEL[g.reason]} code={g.reason} count={g.count}>
      {g.examples.slice(0, EXAMPLES).map((x) => (
        <Example key={`${x.from}:${x.line}`} title={x.detail}>
          {x.from}:{x.line} <span className="text-foreground/70">{x.specifier}</span>
        </Example>
      ))}
    </Row>
  ));
}

/** One reason and its count. Its examples, when it has any, open beneath it on click. */
function Row({ label, code, count, unit, children }: { label: string; code?: string; count: number; unit?: "file"; children?: ReactNode }) {
  const line = (
    <>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
        {formatCount(count)}
        {unit && ` ${count === 1 ? unit : `${unit}s`}`}
      </span>
    </>
  );
  if (!children) {
    return (
      <p className="flex items-center gap-2 rounded px-1.5 py-1 text-[10.5px]" title={code}>
        <span className="size-3 shrink-0" />
        {line}
      </p>
    );
  }
  return (
    <details className="drop-details group">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded px-1.5 py-1 text-[10.5px] hover:bg-background [&::-webkit-details-marker]:hidden"
        title={code}
      >
        <Icon name="chevronRight" className="drop-chevron size-3 shrink-0 text-muted group-open:rotate-90" />
        {line}
      </summary>
      <div className="mb-1 ml-[1.375rem] border-l border-border pl-2">{children}</div>
    </details>
  );
}

function Example({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <p className="truncate py-0.5 font-mono text-[10px] text-muted" title={title}>
      {children}
    </p>
  );
}
