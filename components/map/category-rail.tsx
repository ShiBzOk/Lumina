"use client";

import type { Filter } from "@/lib/map/highlight";
import { FILE_TYPES, type FileType } from "@/lib/map/model";
import { TYPE_COLOR } from "./colors";
import { Icon } from "./icons";

interface CategoryRailProps {
  total: number;
  /** Files not hidden by the type filter: the sum of the area counts. */
  matching: number;
  /** Top-level directories and how many of their files the type filter keeps, largest first. */
  areas: readonly { area: string; count: number }[];
  /** Which file types exist in this repository at all. */
  types: ReadonlySet<FileType>;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  onCollapse: () => void;
}

export function CategoryRail({ total, matching, areas, types, filter, onFilter, onCollapse }: CategoryRailProps) {
  const toggleType = (type: FileType) => {
    const hidden = new Set(filter.hiddenTypes);
    if (!hidden.delete(type)) hidden.add(type);
    onFilter({ ...filter, hiddenTypes: hidden });
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <Icon name="layers" className="size-3.5 text-muted" />
        <span className="text-xs font-medium">Categories</span>
        <span className="font-mono text-[10px] text-muted">· {total} files</span>
        <span className="flex-1" />
        <button type="button" onClick={onCollapse} title="Hide categories" className="rounded p-1 text-muted hover:bg-background">
          <Icon name="chevronLeft" className="size-3.5" />
        </button>
      </div>

      {filter.area !== null && (
        <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2 text-[11px]">
          <span className="min-w-0 flex-1 truncate text-muted">
            Filtering: <span className="font-mono text-foreground">{filter.area}</span>
          </span>
          <button
            type="button"
            onClick={() => onFilter({ ...filter, area: null })}
            className="flex items-center gap-0.5 text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            <Icon name="x" className="size-3" /> Clear
          </button>
        </div>
      )}

      <p className="px-3 pt-2.5 pb-1 text-[10px] text-muted">Top-level folders</p>
      <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-2">
        <AreaButton label="All files" count={matching} active={filter.area === null} onClick={() => onFilter({ ...filter, area: null })} />
        {areas.map(({ area, count }) => (
          <AreaButton
            key={area}
            label={area}
            mono
            count={count}
            active={filter.area === area}
            onClick={() => onFilter({ ...filter, area: filter.area === area ? null : area })}
          />
        ))}
      </nav>

      <div className="border-t border-border px-3 py-2.5">
        <p className="mb-1.5 text-[10px] text-muted">Filter by file type</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {FILE_TYPES.filter(({ type }) => types.has(type)).map(({ type, label }) => {
            const hidden = filter.hiddenTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={!hidden}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-1.5 rounded px-1 py-1 text-left font-mono text-[10.5px] hover:bg-background ${
                  hidden ? "text-muted/60 line-through" : "text-muted"
                }`}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: hidden ? "#d4d8df" : TYPE_COLOR[type] }}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function AreaButton({
  label,
  count,
  active,
  mono = false,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  mono?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs ${
        active ? "bg-foreground font-medium text-surface" : "text-foreground/80 hover:bg-background"
      }`}
    >
      <span className={`truncate ${mono ? "font-mono text-[11px]" : ""}`}>{label}</span>
      <span className={`font-mono text-[10.5px] tabular-nums ${active ? "text-surface/80" : "text-muted"}`}>{count}</span>
    </button>
  );
}
