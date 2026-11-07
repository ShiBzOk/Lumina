"use client";

import type { Missing } from "@/lib/map/view";
import { Icon } from "./icons";

// What the address named that this analysis doesn't hold, said plainly. The
// map opens anyway, with none of it selected and nothing near it picked instead.
export function MissingFromLink({ missing, onDismiss }: { missing: readonly Missing[]; onDismiss: () => void }) {
  if (missing.length === 0) return null;
  return (
    <section className="flex shrink-0 items-start gap-2 border-b border-border bg-surface px-4 py-1.5 text-[11px]">
      <Icon name="alert" className="mt-px size-3.5 shrink-0 text-muted" />
      <ul className="min-w-0 flex-1">
        {missing.map((m) => (
          <li key={`${m.kind}:${m.kind === "file" ? m.path : m.id}`} className="break-all">
            {m.kind === "file" ? (
              <>
                <span className="font-mono">{m.path}</span> is not in this analysis, so nothing is selected.
              </>
            ) : m.kind === "folder" ? (
              <>
                <span className="font-mono">{m.id}</span> is not a folder on this map.
              </>
            ) : (
              <>The analysis this link compares against is not one of this repository&apos;s finished analyses, so Compare is off.</>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDismiss} data-tip="Dismiss" aria-label="Dismiss" className="shrink-0 text-muted hover:text-foreground">
        <Icon name="x" className="size-3" />
      </button>
    </section>
  );
}
