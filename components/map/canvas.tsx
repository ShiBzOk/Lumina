"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { isFiltering, matches, type Filter, type Highlight, type Selection } from "@/lib/map/highlight";
import {
  CARD_WIDTH,
  HEADER_HEIGHT,
  LIST_PADDING,
  MAX_VISIBLE_ROWS,
  ROW_HEIGHT,
  cardHeight,
  type Point,
} from "@/lib/map/layout";
import type { MapNode, RepoMap } from "@/lib/map/model";
import { DIRECTION_COLOR } from "./colors";
import { Icon, type IconName } from "./icons";
import { Minimap, type Bounds } from "./minimap";
import { NodeCard } from "./node-card";

export interface Viewport {
  x: number;
  y: number;
  k: number;
}

/** Which side handles of a row a connection meets, coloured as the canvas colours it. */
export interface Sides {
  left?: "in" | "out";
  right?: "in" | "out";
}

export interface CanvasHandle {
  /** Bring a node, and optionally one of its files, into view. Only ever called from a click. */
  reveal: (id: string, path?: string) => void;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;
const FIT_PADDING = 56;
/** Pointer travel below this is a click, not a drag. */
const CLICK_SLOP = 3;

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

type Gesture =
  | { type: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean; row: string | undefined }
  | { type: "drag"; id: string; sx: number; sy: number; px: number; py: number; moved: boolean };

function boundsOf(nodes: readonly MapNode[], positions: ReadonlyMap<string, Point>): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + CARD_WIDTH);
    maxY = Math.max(maxY, p.y + cardHeight(n.files.length));
  }
  return minX === Infinity ? { minX: 0, minY: 0, maxX: 1, maxY: 1 } : { minX, minY, maxX, maxY };
}

function fit(b: Bounds, w: number, h: number): Viewport {
  const k = clampZoom(Math.min((w - FIT_PADDING * 2) / (b.maxX - b.minX), (h - FIT_PADDING * 2) / (b.maxY - b.minY), 1));
  return { k, x: (w - (b.maxX - b.minX) * k) / 2 - b.minX * k, y: (h - (b.maxY - b.minY) * k) / 2 - b.minY * k };
}

interface CanvasProps {
  map: RepoMap;
  selection: Selection;
  highlight: Highlight | null;
  /** Lit wherever it is on the map, whether the pointer is over it here or in the pane. */
  hovered: Selection;
  filter: Filter;
  onSelect: (selection: Selection) => void;
  onHover: (target: Selection) => void;
  /** Floats at the top centre of the canvas. */
  banner: ReactNode;
  /** Extra floating controls, positioned by the caller. */
  children?: ReactNode;
  ref?: Ref<CanvasHandle>;
}

export function Canvas({ map, selection, highlight, hovered, filter, onSelect, onHover, banner, children, ref }: CanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState(() => new Map(map.positions));
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  // First file shown in each card that holds more than MAX_VISIBLE_ROWS.
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(new Map());
  const [mode, setMode] = useState<"select" | "hand">("select");
  const [grid, setGrid] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const gesture = useRef<Gesture | null>(null);

  // Read inside observers and native listeners, which outlive a render.
  const live = useRef({ viewport, size, positions });
  useEffect(() => {
    live.current = { viewport, size, positions };
  });

  const filtering = isFiltering(filter);
  const rowIndex = useMemo(() => {
    const index = new Map<string, number>();
    for (const n of map.nodes) n.files.forEach((f, i) => index.set(f.path, i));
    return index;
  }, [map]);
  const rowCount = useMemo(() => new Map(map.nodes.map((n) => [n.id, n.files.length])), [map]);
  const rowsByPath = useMemo(() => new Map(map.nodes.flatMap((n) => n.files.map((f) => [f.path, f] as const))), [map]);

  // The canvas is sized by whatever panels frame it. On the first measurement
  // it fits the whole map; after that a panel opening or closing may only zoom
  // out, never in, and the fit reads the size after the change, not before.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      const prev = live.current.size;
      setSize({ w, h });
      if (w === 0 || h === 0) return;
      const fitted = fit(boundsOf(map.nodes, live.current.positions), w, h);
      if (prev.w === 0) return setViewport(fitted);
      setViewport((v) => (fitted.k < v.k ? fitted : { ...v, x: v.x + (w - prev.w) / 2, y: v.y + (h - prev.h) / 2 }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setViewport((v) => {
      const k = clampZoom(v.k * factor);
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, []);

  const step = useCallback(
    (id: string, by: number) =>
      setOffsets((o) => {
        const max = Math.max(0, (rowCount.get(id) ?? 0) - MAX_VISIBLE_ROWS);
        const next = Math.min(max, Math.max(0, (o.get(id) ?? 0) + by));
        return next === (o.get(id) ?? 0) ? o : new Map(o).set(id, next);
      }),
    [rowCount],
  );

  // Native, because React's wheel listener is passive and can't stop the page
  // scrolling. The wheel zooms; over a card with more files than it shows, it
  // steps that card's list one whole file at a time instead.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let pending = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      const rows = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-rows]") : null;
      if (rows?.dataset.rows && !e.ctrlKey) {
        // Trackpads send many small deltas; gather them so one row is one gesture's worth.
        pending += delta;
        const rowsToMove = Math.trunc(pending / 40);
        if (rowsToMove !== 0) {
          pending -= rowsToMove * 40;
          step(rows.dataset.rows, rowsToMove);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      // Pinch arrives as ctrl+wheel with small deltas, so it gets more weight.
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, step]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      reveal(id, path) {
        // A file outside its card's window is brought into it first.
        const index = path === undefined ? -1 : (rowIndex.get(path) ?? -1);
        if (index !== -1) {
          setOffsets((o) => {
            const at = o.get(id) ?? 0;
            if (index >= at && index < at + MAX_VISIBLE_ROWS) return o;
            const max = Math.max(0, (rowCount.get(id) ?? 0) - MAX_VISIBLE_ROWS);
            return new Map(o).set(id, Math.min(max, Math.max(0, index - Math.floor(MAX_VISIBLE_ROWS / 2))));
          });
        }
        const { viewport: v, size: s, positions: ps } = live.current;
        const p = ps.get(id);
        if (!p) return;
        const h = cardHeight(rowCount.get(id) ?? 0);
        const left = p.x * v.k + v.x;
        const top = p.y * v.k + v.y;
        const inView = left >= 0 && top >= 0 && left + CARD_WIDTH * v.k <= s.w && top + h * v.k <= s.h;
        if (inView) return;
        setViewport({ k: v.k, x: s.w / 2 - (p.x + CARD_WIDTH / 2) * v.k, y: s.h / 2 - (p.y + h / 2) * v.k });
      },
    }),
    [rowCount, rowIndex],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    if (e.target.closest("[data-overlay]")) return;
    const header = e.target.closest<HTMLElement>("[data-card-header]");
    if (mode === "select" && header) {
      const id = header.dataset.cardHeader ?? "";
      const p = positions.get(id);
      if (!p) return;
      gesture.current = { type: "drag", id, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false };
    } else {
      // Holding and dragging anywhere else moves the map, file rows included;
      // a row pressed and released without moving is still a click on it.
      const row = mode === "select" ? e.target.closest<HTMLElement>("[data-row]")?.dataset.row : undefined;
      gesture.current = { type: "pan", sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y, moved: false, row };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    g.moved = true;
    if (g.type === "pan") {
      setViewport((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    } else {
      const k = viewport.k;
      setPositions((ps) => new Map(ps).set(g.id, { x: g.px + dx / k, y: g.py + dy / k }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g || g.moved) return;
    if (g.type === "drag") onSelect({ kind: "node", id: g.id });
    else if (g.row) onSelect({ kind: "file", path: g.row });
    else if (mode === "select" && !(e.target instanceof Element && e.target.closest("[data-card]"))) onSelect(null);
  };

  // A row is the file; anywhere else on a card is its folder. Nothing reports
  // while a gesture is underway, so a pan doesn't sweep highlights across the pane.
  const onPointerOver = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gesture.current || !(e.target instanceof Element) || e.target.closest("[data-overlay]")) return;
    const row = e.target.closest<HTMLElement>("[data-row]")?.dataset.row;
    const id = e.target.closest<HTMLElement>("[data-card]")?.dataset.card;
    onHover(row !== undefined ? { kind: "file", path: row } : id !== undefined ? { kind: "node", id } : null);
  };

  const onSelectFile = useCallback((path: string) => onSelect({ kind: "file", path }), [onSelect]);

  // Where a file sits in its card's window, or null when it isn't shown.
  const rowSlot = useCallback(
    (node: string, path: string) => {
      const slot = (rowIndex.get(path) ?? 0) - (offsets.get(node) ?? 0);
      return slot >= 0 && slot < MAX_VISIBLE_ROWS ? slot : null;
    },
    [rowIndex, offsets],
  );

  const edgePaths = useMemo(() => {
    const quiet: ReactNode[] = [];
    const lit: ReactNode[] = [];
    // The hovered file's own connections, drawn last so nothing crosses them.
    const top: ReactNode[] = [];
    const hoveredPath = hovered?.kind === "file" ? hovered.path : null;
    map.edges.forEach((e, i) => {
      const a = positions.get(e.fromNode);
      const b = positions.get(e.toNode);
      if (!a || !b) return;
      const direction = highlight?.edges.get(i);
      const fromSlot = rowSlot(e.fromNode, e.from);
      const toSlot = rowSlot(e.toNode, e.to);
      // Only files on screen are connected. A lit edge is the exception: a
      // selection never loses a connection, so its hidden end meets the header.
      const hot = hoveredPath !== null && (e.from === hoveredPath || e.to === hoveredPath);
      if ((fromSlot === null || toSlot === null) && !direction && !hot) return;
      const rowY = (slot: number | null) => (slot === null ? HEADER_HEIGHT / 2 : HEADER_HEIGHT + LIST_PADDING + slot * ROW_HEIGHT + ROW_HEIGHT / 2);
      const x1 = a.x + CARD_WIDTH;
      const y1 = a.y + rowY(fromSlot);
      const y2 = b.y + rowY(toSlot);
      // Within one folder the curve loops out of the right side and back in;
      // between folders it leaves the importer's right and enters the target's left.
      const same = e.fromNode === e.toNode;
      const x2 = same ? x1 : b.x;
      const dx = same ? 36 + Math.abs(y2 - y1) * 0.25 : Math.max(60, Math.abs(x2 - x1) * 0.5);
      const d = `M${x1},${y1} C${x1 + dx},${y1} ${same ? x2 + dx : x2 - dx},${y2} ${x2},${y2}`;

      if (hot) {
        // Coloured as a click would colour it, relative to the hovered file.
        const towards = e.from === hoveredPath ? "out" : "in";
        top.push(<path key={i} d={d} stroke={DIRECTION_COLOR[towards]} strokeWidth={3} fill="none" />);
        return;
      }
      if (direction) {
        lit.push(<path key={i} d={d} stroke={DIRECTION_COLOR[direction]} strokeWidth={2.5} fill="none" />);
        return;
      }
      const from = rowsByPath.get(e.from);
      const to = rowsByPath.get(e.to);
      const filteredOut = filtering && (!from || !to || !matches(from, filter) || !matches(to, filter));
      const opacity = highlight ? 0.18 : filteredOut ? 0.2 : 0.9;
      quiet.push(<path key={i} d={d} stroke="var(--edge)" strokeWidth={1} strokeOpacity={opacity} fill="none" />);
    });
    return [...quiet, ...lit, ...top];
  }, [map.edges, positions, rowSlot, highlight, hovered, filtering, filter, rowsByPath]);

  // Which handles the hovered file's connections meet, per card and row. A
  // connection leaves its importer on the right and enters its target on the
  // left, or on the right when both ends share a folder.
  const traced = useMemo(() => {
    const byNode = new Map<string, Map<string, Sides>>();
    if (hovered?.kind !== "file") return byNode;
    const mark = (node: string, path: string, side: keyof Sides, towards: "in" | "out") => {
      const rows = byNode.get(node) ?? new Map<string, Sides>();
      byNode.set(node, rows.set(path, { ...rows.get(path), [side]: towards }));
    };
    for (const e of map.edges) {
      if (e.from !== hovered.path && e.to !== hovered.path) continue;
      const towards = e.from === hovered.path ? "out" : "in";
      mark(e.fromNode, e.from, "right", towards);
      mark(e.toNode, e.to, e.fromNode === e.toNode ? "right" : "left", towards);
    }
    return byNode;
  }, [hovered, map.edges]);

  const bounds = useMemo(() => boundsOf(map.nodes, positions), [map.nodes, positions]);

  const zoomBy = (factor: number) => zoomAt(size.w / 2, size.h / 2, factor);

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerLeave={() => onHover(null)}
      className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-background select-none ${
        mode === "hand" ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={
        grid
          ? {
              backgroundImage: "radial-gradient(circle, rgba(148, 158, 175, 0.2) 1px, transparent 1.4px)",
              // Fixed to the screen, not the map: the same size at every zoom.
              backgroundSize: "24px 24px",
            }
          : undefined
      }
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})` }}
      >
        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
          {edgePaths}
        </svg>
        {map.nodes.map((n) => (
          <NodeCard
            key={n.id}
            node={n}
            position={positions.get(n.id) ?? { x: 0, y: 0 }}
            selection={selection}
            highlight={highlight}
            // Only the card holding what is hovered gets a value, so a hover redraws one card.
            hovered={
              hovered?.kind === "node" ? (hovered.id === n.id ? hovered : null) : hovered && map.nodeOf.get(hovered.path) === n.id ? hovered : null
            }
            traced={traced.get(n.id) ?? null}
            filter={filter}
            filtering={filtering}
            selectable={mode === "select"}
            offset={offsets.get(n.id) ?? 0}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>

      <div data-overlay className="absolute top-3 left-1/2 -translate-x-1/2">
        {banner}
      </div>

      {minimap && (
        <div data-overlay className="absolute top-3 right-3">
          <Minimap
            nodes={map.nodes}
            positions={positions}
            bounds={bounds}
            viewport={viewport}
            size={size}
            lit={highlight?.nodes ?? null}
            onCenter={(x, y) => setViewport((v) => ({ ...v, x: size.w / 2 - x * v.k, y: size.h / 2 - y * v.k }))}
          />
        </div>
      )}

      {children}

      <div
        data-overlay
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-surface p-1 shadow-[0_2px_10px_rgba(16,24,40,0.08)] ring-1 ring-border"
      >
        <ToolButton icon="pointer" label="Select" active={mode === "select"} solid onClick={() => setMode("select")} />
        <ToolButton icon="hand" label="Pan" active={mode === "hand"} solid onClick={() => setMode("hand")} />
        <Divider />
        <ToolButton icon="grid" label="Dot grid" active={grid} onClick={() => setGrid((g) => !g)} />
        <ToolButton icon="map" label="Minimap" active={minimap} onClick={() => setMinimap((m) => !m)} />
        <Divider />
        <ToolButton icon="zoomOut" label="Zoom out" onClick={() => zoomBy(1 / 1.2)} />
        <button
          type="button"
          title="Fit to screen"
          onClick={() => setViewport(fit(bounds, size.w, size.h))}
          className="w-12 rounded-md py-1.5 text-center font-mono text-[11px] text-muted tabular-nums hover:bg-background"
        >
          {Math.round(viewport.k * 100)}%
        </button>
        <ToolButton icon="zoomIn" label="Zoom in" onClick={() => zoomBy(1.2)} />
        <Divider />
        <ToolButton
          icon={fullscreen ? "minimize" : "maximize"}
          label={fullscreen ? "Exit full screen" : "Full screen"}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
        />
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active = false,
  solid = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  solid?: boolean;
  onClick: () => void;
}) {
  const on = solid ? "bg-foreground text-surface" : "bg-accent/10 text-accent";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-lg ${active ? on : "text-muted hover:bg-background hover:text-foreground"}`}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}
