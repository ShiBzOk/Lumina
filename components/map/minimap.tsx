"use client";

import { useRef } from "react";
import { CARD_WIDTH, cardHeight, type Point } from "@/lib/map/layout";
import type { MapNode } from "@/lib/map/model";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const W = 176;
const H = 112;
const PAD = 8;

interface MinimapProps {
  nodes: readonly MapNode[];
  positions: ReadonlyMap<string, Point>;
  bounds: Bounds;
  viewport: { x: number; y: number; k: number };
  size: { w: number; h: number };
  /** Nodes lit by the current selection, or null when nothing is selected. */
  lit: ReadonlySet<string> | null;
  compact: boolean;
  /** A click: bring this world point to the centre of the canvas. */
  onCenter: (x: number, y: number) => void;
  /** A drag: move the view by this much, in world units. */
  onPan: (dx: number, dy: number) => void;
}

/** Pointer travel, in pixels, before a press counts as a drag rather than a click. */
const DRAG_AFTER = 3;
/**
 * How fast the view box moves relative to the pointer while dragging. At 1 it
 * stays under the hand, which on a minimap this small crosses the whole map in
 * a flick; lower trades that reach for control.
 */
const DRAG_SPEED = 0.4;

export function Minimap({ nodes, positions, bounds, viewport, size, lit, compact, onCenter, onPan }: MinimapProps) {
  // A press does nothing yet: it becomes a click on release if the pointer
  // barely moved, or a drag once it moves further.
  const press = useRef<{ startX: number; startY: number; lastX: number; lastY: number; dragging: boolean } | null>(null);
  const scale = Math.min((W - PAD * 2) / (bounds.maxX - bounds.minX), (H - PAD * 2) / (bounds.maxY - bounds.minY));
  const ox = PAD + (W - PAD * 2 - (bounds.maxX - bounds.minX) * scale) / 2;
  const oy = PAD + (H - PAD * 2 - (bounds.maxY - bounds.minY) * scale) / 2;
  const toMap = (x: number, y: number) => ({ x: ox + (x - bounds.minX) * scale, y: oy + (y - bounds.minY) * scale });

  const view = toMap(-viewport.x / viewport.k, -viewport.y / viewport.k);
  const viewW = (size.w / viewport.k) * scale;
  const viewH = (size.h / viewport.k) * scale;

  const centreAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onCenter((e.clientX - r.left - ox) / scale + bounds.minX, (e.clientY - r.top - oy) / scale + bounds.minY);
  };

  // A drag moves the view by the distance dragged, not to where the pointer
  // is, so it never jumps; DRAG_SPEED sets how far.
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_AFTER) return;
    p.dragging = true;
    onPan(((e.clientX - p.lastX) / scale) * DRAG_SPEED, ((e.clientY - p.lastY) / scale) * DRAG_SPEED);
    p.lastX = e.clientX;
    p.lastY = e.clientY;
  };

  return (
    <svg
      width={W}
      height={H}
      className="block cursor-pointer overflow-hidden rounded-xl bg-surface/95 shadow-[0_2px_10px_rgba(16,24,40,0.08)] ring-1 ring-border"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, dragging: false };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        if (press.current && !press.current.dragging) centreAt(e);
        press.current = null;
      }}
      onPointerCancel={() => (press.current = null)}
      aria-label="Minimap"
    >
      {nodes.map((n) => {
        const p = positions.get(n.id);
        if (!p) return null;
        const m = toMap(p.x, p.y);
        const on = lit?.has(n.id) ?? false;
        return (
          <rect
            key={n.id}
            x={m.x}
            y={m.y}
            width={CARD_WIDTH * scale}
            height={cardHeight(n.files.length, compact) * scale}
            rx={2}
            fill={on ? "var(--accent)" : "#c6cfdc"}
            fillOpacity={lit && !on ? 0.45 : 0.9}
          />
        );
      })}
      <rect
        x={view.x}
        y={view.y}
        width={viewW}
        height={viewH}
        fill="var(--accent)"
        fillOpacity={0.07}
        stroke="var(--accent)"
        strokeWidth={1}
        rx={2}
      />
    </svg>
  );
}
