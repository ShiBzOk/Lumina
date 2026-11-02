"use client";

import { memo } from "react";
import { matches, type Direction, type Filter, type Highlight, type Selection } from "@/lib/map/highlight";
import { CARD_WIDTH, HEADER_HEIGHT, LIST_PADDING, MAX_VISIBLE_ROWS, ROW_HEIGHT, type Point } from "@/lib/map/layout";
import type { FileRow, MapNode } from "@/lib/map/model";
import { DIRECTION_COLOR, TYPE_COLOR } from "./colors";
import type { Sides } from "./canvas";
import { Icon } from "./icons";

interface NodeCardProps {
  node: MapNode;
  position: Point;
  selection: Selection;
  highlight: Highlight | null;
  /** This card, or one of its files, when the pointer is over it here or in the pane. */
  hovered: Selection;
  /** Rows the hovered file's connections end on, and the sides they meet. */
  traced: ReadonlyMap<string, Sides> | null;
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
  hovered,
  traced,
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
  const hoveredFile = hovered?.kind === "file" ? hovered.path : null;
  // A hovered file scrolled out of the card's window lights the card instead; nothing scrolls on its own.
  const isHovered = hovered?.kind === "node" || (hoveredFile !== null && !shown.some((f) => f.path === hoveredFile));
  const lit = highlight?.nodes.has(node.id) ?? false;
  const matching = filtering ? node.files.filter((f) => matches(f, filter)).length : node.files.length;
  const dimmed = (highlight !== null && !lit) || matching === 0;

  return (
    <div
      data-card={node.id}
      className={`absolute top-0 left-0 rounded-2xl bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_20px_rgba(16,24,40,0.05)] ring-1 ${
        isSelected ? "ring-2 ring-accent" : isHovered ? "ring-accent" : lit ? "ring-accent/60" : "ring-border/70"
      } ${dimmed && !isHovered && !traced ? "opacity-30" : ""}`}
      style={{ width: CARD_WIDTH, transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        data-card-header={node.id}
        className={`relative flex items-center gap-3 border-b border-border/60 px-5 ${selectable ? "cursor-pointer" : ""}`}
        style={{ height: HEADER_HEIGHT }}
      >
        <HeaderHandle side="left" lit={lit} />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground/80">
          <Icon name="folder" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-[18px] font-semibold">{node.label}</p>
          <p className="truncate font-mono text-[10.5px] leading-4 text-muted">{node.id === "." ? "./" : `${node.id}/`}</p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-2 py-0.5 font-mono text-[10.5px] text-muted">
          {overflow && `${offset + 1}–${offset + shown.length} of `}
          {/* While filtering every card says how many matched, so the counts on screen add up to the rail's. */}
          {filtering ? `${matching}/${node.files.length}` : node.files.length} files
        </span>
        <span className="shrink-0 cursor-grab text-muted/70 active:cursor-grabbing" title="Drag to move">
          <Icon name="move" className="size-3.5" />
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
            hovered={f.path === hoveredFile}
            traced={traced?.get(f.path)}
            dimmed={f.path !== hoveredFile && !traced?.has(f.path) && ((highlight !== null && !highlight.files.has(f.path)) || (filtering && !matches(f, filter)))}
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
      className={`absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-surface ${
        side === "left" ? "-left-[6px]" : "-right-[6px]"
      } ${lit ? "bg-accent ring-2 ring-accent/25" : "bg-[#9aa3b2]"}`}
      aria-hidden
    />
  );
}

function Row({
  file,
  selected,
  hovered,
  traced,
  dimmed,
  handles,
  selectable,
  onSelect,
}: {
  file: FileRow;
  selected: boolean;
  hovered: boolean;
  traced: Sides | undefined;
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
      className={`relative mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-3 rounded-lg px-5 text-left ${
        selected ? "bg-accent/8 ring-1 ring-accent/40" : hovered ? "bg-background ring-1 ring-border" : selectable ? "hover:bg-background" : ""
      } ${dimmed ? "opacity-40" : ""}`}
      style={{ height: ROW_HEIGHT }}
    >
      <RowHandle side="left" direction={handles?.left} traced={traced?.left} />
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[file.type] }} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{file.label}</span>
      <span className="flex shrink-0 gap-2 font-mono text-[10px] tabular-nums">
        {file.fanIn > 0 && <span className="text-incoming">{file.fanIn} in</span>}
        {file.fanOut > 0 && <span className="text-outgoing">{file.fanOut} out</span>}
      </span>
      <RowHandle side="right" direction={handles?.right} traced={traced?.right} />
    </button>
  );
}

function RowHandle({ side, direction, traced }: { side: "left" | "right"; direction: Direction | undefined; traced: Direction | undefined }) {
  const color = traced ? DIRECTION_COLOR[traced] : direction ? DIRECTION_COLOR[direction] : "#d4d8df";
  return (
    <span
      className={`absolute top-1/2 -translate-y-1/2 rounded-full ${side === "left" ? "left-1" : "right-1"} ${
        traced ? "size-[9px]" : "size-[7px]"
      }`}
      style={{ background: color, boxShadow: traced ? `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)` : undefined }}
      aria-hidden
    />
  );
}
