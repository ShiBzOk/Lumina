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
  /** Centre the canvas on this world point. */
  onCenter: (x: number, y: number) => void;
}

export function Minimap({ nodes, positions, bounds, viewport, size, lit, onCenter }: MinimapProps) {
  const dragging = useRef(false);
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

  return (
    <svg
      width={W}
      height={H}
      className="block cursor-pointer overflow-hidden rounded-xl bg-surface/95 shadow-[0_2px_10px_rgba(16,24,40,0.08)] ring-1 ring-border"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        centreAt(e);
      }}
      onPointerMove={(e) => dragging.current && centreAt(e)}
      onPointerUp={() => (dragging.current = false)}
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
            height={cardHeight(n.files.length) * scale}
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
