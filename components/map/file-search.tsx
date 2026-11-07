"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Selection } from "@/lib/map/highlight";
import type { MapNode } from "@/lib/map/model";
import { Icon } from "./icons";

/** Rows drawn at once; past this the list says how many more there are. */
const LIMIT = 50;

interface Result {
  key: string;
  kind: "folder" | "file";
  name: string;
  path: string;
  pick: NonNullable<Selection>;
}

/** Plain substring match over folder and file paths, in a dialog opened from the header or Ctrl+K. */
export function FileSearch({ nodes, onPick }: { nodes: readonly MapNode[]; onPick: (selection: NonNullable<Selection>) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Folders first: there are fewer of them and each one stands for many files.
  const all = useMemo<Result[]>(
    () => [
      ...nodes.map((n) => ({
        key: `node:${n.id}`,
        kind: "folder" as const,
        name: n.label,
        path: n.id === "." ? "./" : `${n.id}/`,
        pick: { kind: "node" as const, id: n.id },
      })),
      ...nodes.flatMap((n) =>
        n.files.map((f) => ({
          key: `file:${f.path}`,
          kind: "file" as const,
          name: f.path.slice(f.path.lastIndexOf("/") + 1),
          path: f.path,
          pick: { kind: "file" as const, path: f.path },
        })),
      ),
    ],
    [nodes],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tip="Search folders and files · Ctrl+K"
        aria-label="Search folders and files"
        className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 text-left text-xs text-muted ring-1 ring-border hover:text-foreground lg:w-56"
      >
        <Icon name="search" className="size-3.5 shrink-0" />
        {/* On a narrow screen the button is the icon alone; the dialog it opens is the same. */}
        <span className="hidden truncate lg:inline">Search folders and files</span>
      </button>
      {open && (
        <SearchDialog
          results={all}
          onPick={(s) => {
            setOpen(false);
            onPick(s);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SearchDialog({
  results,
  onPick,
  onClose,
}: {
  results: readonly Result[];
  onPick: (selection: NonNullable<Selection>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const matched = q === "" ? results : results.filter((r) => r.path.toLowerCase().includes(q));
  const shown = matched.slice(0, LIMIT);

  // Arrow keys move the highlight; the list follows it only that far.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/10 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Search folders and files"
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_16px_48px_rgba(16,24,40,0.18)] ring-1 ring-border"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Icon name="search" className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, shown.length - 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
              else if (e.key === "Enter" && shown[active]) onPick(shown[active].pick);
              else if (e.key === "Escape") onClose();
              else return;
              e.preventDefault();
            }}
            placeholder="Search folders and files…"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted"
          />
          <button type="button" onClick={onClose} data-tip="Close · Esc" aria-label="Close" className="rounded p-1 text-muted hover:bg-background hover:text-foreground">
            <Icon name="x" className="size-4" />
          </button>
        </div>

        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">No folder or file path contains “{query.trim()}”.</p>
          ) : (
            shown.map((r, i) => (
              <button
                key={r.key}
                type="button"
                data-index={i}
                onClick={() => onPick(r.pick)}
                onMouseMove={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-background" : ""}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 ring-1 ring-border">
                  <Icon name={r.kind === "folder" ? "folder" : "fileCode"} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px]">{r.name}</span>
                  <span className="block truncate font-mono text-[10.5px] text-muted">{r.path}</span>
                </span>
                <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted ring-1 ring-border">
                  {r.kind}
                </span>
                <Icon name="arrowRight" className={`size-3.5 shrink-0 ${i === active ? "text-foreground" : "text-border"}`} />
              </button>
            ))
          )}
          {matched.length > LIMIT && (
            <p className="px-3 py-2 text-center text-[11px] text-muted">
              Showing {LIMIT} of {matched.length} — type to narrow it down.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 font-mono text-[10.5px] text-muted">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
