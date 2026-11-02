"use client";

import { useEffect, useRef, useState } from "react";
import type { FileRow } from "@/lib/map/model";
import { TYPE_COLOR } from "./colors";
import { Icon } from "./icons";

const LIMIT = 12;

/** Plain substring match over paths, focused with ⌘K / Ctrl+K. */
export function FileSearch({ rows, onPick }: { rows: readonly FileRow[]; onPick: (path: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q === "" ? [] : rows.filter((r) => r.path.toLowerCase().includes(q)).slice(0, LIMIT);

  const pick = (path: string) => {
    onPick(path);
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="relative">
      <label className="flex w-56 items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 ring-1 ring-border focus-within:ring-accent/50">
        <Icon name="search" className="size-3.5 shrink-0 text-muted" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter" && results[active]) pick(results[active].path);
            else if (e.key === "Escape") input.current?.blur();
            else return;
            e.preventDefault();
          }}
          placeholder="Search files"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
        />
        <kbd className="rounded border border-border bg-surface px-1 font-mono text-[10px] text-muted">⌘K</kbd>
      </label>
      {open && q !== "" && (
        <div className="absolute top-full right-0 z-20 mt-1 w-[26rem] overflow-hidden rounded-lg bg-surface py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)] ring-1 ring-border">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted">No file path contains “{query.trim()}”.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                // Before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r.path);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === active ? "bg-background" : ""}`}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[r.type] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{r.path}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
