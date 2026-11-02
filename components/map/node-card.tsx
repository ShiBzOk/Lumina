"use client";

import { memo } from "react";
import { matches, type Direction, type Filter, type Highlight, type Selection } from "@/lib/map/highlight";
import { CARD_WIDTH, HEADER_HEIGHT, LIST_PADDING, MAX_VISIBLE_ROWS, ROW_HEIGHT, type Point } from "@/lib/map/layout";
import type { FileRow, MapNode } from "@/lib/map/model";
import { DIRECTION_COLOR, TYPE_COLOR } from "./colors";
import { Icon } from "./icons";

interface NodeCardProps {
  node: MapNode;
  position: Point;
  selection: Selection;
  highlight: Highlight | null;
  filter: Filter;
  filtering: boolean;
  /** In hand mode cards don't take clicks; the whole canvas pans. */
  selectable: boolean;
  /** Index of the first file shown; the card shows MAX_VISIBLE_ROWS from here. */
  offset: number;
  onSelectFile: (path: string) => void;
}

export const NodeCard = memo(function NodeCard({
  node,
  position,
  selection,
  highlight,
  filter,
  filtering,
  selectable,
  offset,
  onSelectFile,
}: NodeCardProps) {
  const selectedFile = selection?.kind === "file" ? selection.path : null;
  const shown = node.files.slice(offset, offset + MAX_VISIBLE_ROWS);
  const overflow = node.files.length > MAX_VISIBLE_ROWS;

  const isSelected = selection?.kind === "node" && selection.id === node.id;
  const lit = highlight?.nodes.has(node.id) ?? false;
  const matching = filtering ? node.files.filter((f) => matches(f, filter)).length : node.files.length;
  const dimmed = (highlight !== null && !lit) || matching === 0;

  return (
    <div
      data-card
      className={`absolute top-0 left-0 rounded-xl bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.06),0_4px_12px_rgba(16,24,40,0.04)] ring-1 ${
        isSelected ? "ring-2 ring-accent" : lit ? "ring-accent/60" : "ring-border"
      } ${dimmed ? "opacity-30" : ""}`}
      style={{ width: CARD_WIDTH, transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        data-card-header={node.id}
        className={`relative flex items-center gap-2.5 border-b border-border px-3 ${selectable ? "cursor-pointer" : ""}`}
        style={{ height: HEADER_HEIGHT }}
      >
        <HeaderHandle side="left" lit={lit} />
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted">
          <Icon name="folder" className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] leading-4 font-semibold">{node.label}</p>
          <p className="truncate font-mono text-[10px] leading-3.5 text-muted">{node.id === "." ? "./" : `${node.id}/`}</p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-1.5 py-px font-mono text-[10px] text-muted ring-1 ring-border">
          {overflow && `${offset + 1}–${offset + shown.length} of `}
          {filtering && matching !== node.files.length ? `${matching}/${node.files.length}` : node.files.length} files
        </span>
        <span className="shrink-0 cursor-grab text-muted/70 active:cursor-grabbing" title="Drag to move">
          <Icon name="move" className="size-3" />
        </span>
        <HeaderHandle side="right" lit={lit} />
      </div>
      {/* A window of whole rows, stepped one file at a time by the wheel, so
          every row on screen sits exactly where its edges expect it. */}
      <div data-rows={overflow ? node.id : undefined} className="relative" style={{ paddingBlock: LIST_PADDING }}>
        {overflow && (
          <span
            className="absolute right-[3px] w-[3px] rounded-full bg-[#c9cfd8]"
            style={{
              top: LIST_PADDING + (offset / node.files.length) * MAX_VISIBLE_ROWS * ROW_HEIGHT,
              height: (MAX_VISIBLE_ROWS / node.files.length) * MAX_VISIBLE_ROWS * ROW_HEIGHT,
            }}
            aria-hidden
          />
        )}
        {shown.map((f) => (
          <Row
            key={f.path}
            file={f}
            selected={f.path === selectedFile}
            dimmed={(highlight !== null && !highlight.files.has(f.path)) || (filtering && !matches(f, filter))}
            handles={highlight?.handles.get(f.path)}
            selectable={selectable}
            onSelect={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
});

function HeaderHandle({ side, lit }: { side: "left" | "right"; lit: boolean }) {
  return (
    <span
      className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-surface ${
        side === "left" ? "-left-[5px]" : "-right-[5px]"
      } ${lit ? "bg-accent ring-2 ring-accent/25" : "bg-[#9aa3b2]"}`}
      aria-hidden
    />
  );
}

function Row({
  file,
  selected,
  dimmed,
  handles,
  selectable,
  onSelect,
}: {
  file: FileRow;
  selected: boolean;
  dimmed: boolean;
  handles: { left?: Direction; right?: Direction } | undefined;
  selectable: boolean;
  onSelect: (path: string) => void;
}) {
  return (
    <button
      type="button"
      title={file.path}
      data-row={file.path}
      // Pointer clicks are resolved by the canvas, which tells a click from a
      // pan; this only answers the keyboard.
      onKeyDown={(e) => {
        if (!selectable || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onSelect(file.path);
      }}
      className={`relative mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-3 text-left ${
        selected ? "bg-accent/8 ring-1 ring-accent/40" : selectable ? "hover:bg-background" : ""
      } ${dimmed ? "opacity-40" : ""}`}
      style={{ height: ROW_HEIGHT }}
    >
      <RowHandle side="left" direction={handles?.left} />
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[file.type] }} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.label}</span>
      <span className="flex shrink-0 gap-1.5 font-mono text-[9.5px] tabular-nums">
        {file.fanIn > 0 && <span className="text-incoming">{file.fanIn} in</span>}
        {file.fanOut > 0 && <span className="text-outgoing">{file.fanOut} out</span>}
      </span>
      <RowHandle side="right" direction={handles?.right} />
    </button>
  );
}

function RowHandle({ side, direction }: { side: "left" | "right"; direction: Direction | undefined }) {
  return (
    <span
      className={`absolute top-1/2 size-[7px] -translate-y-1/2 rounded-full ${side === "left" ? "left-0.5" : "right-0.5"}`}
      style={{ background: direction ? DIRECTION_COLOR[direction] : "#d4d8df" }}
      aria-hidden
    />
  );
}
