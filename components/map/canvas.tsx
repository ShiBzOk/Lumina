"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { isFiltering, matches, type Filter, type Highlight, type Selection } from "@/lib/map/highlight";
import { CARD_WIDTH, MAX_VISIBLE_ROWS, cardHeight, edgePath, type Point } from "@/lib/map/layout";
import type { MapEdge, MapNode, RepoMap } from "@/lib/map/model";
import { DIRECTION_COLOR } from "./colors";
import { Icon, type IconName } from "./icons";
import { Minimap, type Bounds } from "./minimap";
import { lerp, spring } from "./motion";
import { NodeCard, type FileMark } from "./node-card";

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

function boundsOf(nodes: readonly MapNode[], positions: ReadonlyMap<string, Point>, compact: boolean): Bounds {
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
    maxY = Math.max(maxY, p.y + cardHeight(n.files.length, compact));
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
  /** Files added or changed since a compared base, by path; null outside Compare. */
  marks: ReadonlyMap<string, FileMark> | null;
  onSelect: (selection: Selection) => void;
  onHover: (target: Selection) => void;
  /** Floats at the top centre of the canvas. */
  banner: ReactNode;
  /** Extra floating controls, positioned by the caller. */
  children?: ReactNode;
  ref?: Ref<CanvasHandle>;
}

export function Canvas({ map, selection, highlight, hovered, filter, marks, onSelect, onHover, banner, children, ref }: CanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  // Each starts as its layout itself, so "moved" is just "no longer the same map".
  // Kept apart, so arranging one view leaves the other as it was.
  const [fullPositions, setFullPositions] = useState<ReadonlyMap<string, Point>>(map.positions);
  const [compactPositions, setCompactPositions] = useState<ReadonlyMap<string, Point>>(map.compactPositions);
  const positions = compact ? compactPositions : fullPositions;
  const setPositions = compact ? setCompactPositions : setFullPositions;
  const laidOut = compact ? map.compactPositions : map.positions;
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  // First file shown in each card that holds more than MAX_VISIBLE_ROWS.
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(new Map());
  const [minimap, setMinimap] = useState(true);
  const [onlyLit, setOnlyLit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  // What a click set moving. A gesture cancels it and carries on from what's
  // on screen; a wheel or drag is never animated, it follows the hand.
  const glide = useRef<{ from: Viewport; to: Viewport; cancel: () => void } | null>(null);
  // Stops a card animation and hands back where the cards were left.
  const arranging = useRef<(() => ReadonlyMap<string, Point>) | null>(null);

  // Read inside observers and native listeners, which outlive a render.
  const live = useRef({ viewport, size, positions, compact });
  useEffect(() => {
    live.current = { viewport, size, positions, compact };
  });
  useEffect(
    () => () => {
      glide.current?.cancel();
      arranging.current?.();
    },
    [],
  );

  const stopGlide = useCallback(() => {
    glide.current?.cancel();
    glide.current = null;
  }, []);

  // Linear in x, y and k together, which keeps a zoom's anchor point still the whole way.
  const glideTo = useCallback((to: Viewport) => {
    glide.current?.cancel();
    const g = { from: live.current.viewport, to, cancel: () => {} };
    g.cancel = spring((p) => {
      setViewport({ x: lerp(g.from.x, g.to.x, p), y: lerp(g.from.y, g.to.y, p), k: lerp(g.from.k, g.to.k, p) });
      if (p === 1 && glide.current === g) glide.current = null;
    });
    glide.current = g;
  }, []);

  // Cards travel to their new places with their edges attached. The frames
  // in between are written straight to the page: going through state would
  // redraw every card and edge sixty times a second. State hears only where
  // they start, and where they stop: `to` itself, so a reset is
  // recognisably the layout again, or wherever a drag interrupted them.
  const arrange = (
    set: (ps: ReadonlyMap<string, Point>) => void,
    from: ReadonlyMap<string, Point>,
    to: ReadonlyMap<string, Point>,
    compactAfter: boolean,
  ) => {
    arranging.current?.();
    set(from);
    let at = from;
    let cards: [HTMLElement, string][] | null = null;
    let paths: [SVGPathElement, MapEdge, number | null, number | null][] | null = null;
    const stop = spring((p) => {
      if (p === 1) {
        arranging.current = null;
        return set(to);
      }
      // Gathered on the first frame, once the click's render has put the right cards and edges on the page.
      cards ??= Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [], (el) => [el, el.dataset.card ?? ""]);
      paths ??= Array.from(rootRef.current?.querySelectorAll<SVGPathElement>("path[data-edge]") ?? [], (el) => {
        const e = map.edges[Number(el.dataset.edge)];
        return [el, e, compactAfter ? null : rowSlot(e.fromNode, e.from), compactAfter ? null : rowSlot(e.toNode, e.to)];
      });
      const next = new Map<string, Point>();
      for (const [id, b] of to) {
        const a = from.get(id) ?? b;
        next.set(id, { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
      }
      at = next;
      for (const [el, id] of cards) {
        const q = at.get(id);
        if (q) el.style.transform = `translate(${q.x}px, ${q.y}px)`;
      }
      for (const [el, e, fromSlot, toSlot] of paths) {
        const a = at.get(e.fromNode);
        const b = at.get(e.toNode);
        if (a && b) el.setAttribute("d", edgePath(a, b, fromSlot, toSlot, e.fromNode === e.toNode));
      }
    });
    arranging.current = () => {
      stop();
      arranging.current = null;
      set(at);
      return at;
    };
  };

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
      // Mid-glide, keep its destination where it was on screen and let it finish.
      const g = glide.current;
      if (g && prev.w !== 0) {
        const dx = (w - prev.w) / 2;
        const dy = (h - prev.h) / 2;
        g.from = { ...g.from, x: g.from.x + dx, y: g.from.y + dy };
        g.to = { ...g.to, x: g.to.x + dx, y: g.to.y + dy };
        return;
      }
      const fitted = fit(boundsOf(map.nodes, live.current.positions, live.current.compact), w, h);
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
      stopGlide();
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
  }, [zoomAt, step, stopGlide]);

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
        const { viewport: v, size: s, positions: ps, compact: c } = live.current;
        const p = ps.get(id);
        if (!p) return;
        const h = cardHeight(rowCount.get(id) ?? 0, c);
        const left = p.x * v.k + v.x;
        const top = p.y * v.k + v.y;
        const inView = left >= 0 && top >= 0 && left + CARD_WIDTH * v.k <= s.w && top + h * v.k <= s.h;
        if (inView) return;
        glideTo({ k: v.k, x: s.w / 2 - (p.x + CARD_WIDTH / 2) * v.k, y: s.h / 2 - (p.y + h / 2) * v.k });
      },
    }),
    [rowCount, rowIndex, glideTo],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    if (e.target.closest("[data-overlay]")) return;
    stopGlide();
    const header = e.target.closest<HTMLElement>("[data-card-header]");
    if (header) {
      const id = header.dataset.cardHeader ?? "";
      // Mid-animation, the card is grabbed where it is on screen, not where state last put it.
      const p = (arranging.current?.() ?? positions).get(id);
      if (!p) return;
      gesture.current = { type: "drag", id, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false };
    } else {
      // Holding and dragging anywhere else moves the map, file rows included;
      // a row pressed and released without moving is still a click on it.
      const row = e.target.closest<HTMLElement>("[data-row]")?.dataset.row;
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
    else if (!(e.target instanceof Element && e.target.closest("[data-card]"))) onSelect(null);
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
  // Compact cards show no rows, so there every connection meets a header.
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
    // Links that meet the same two points draw the same curve: every file whose
    // row is scrolled out of view meets its card's header, and on a compact map
    // every link between two folders runs header to header. Each curve is drawn
    // once, because hundreds of stacked copies look identical and cost the
    // browser a repaint each, every frame of a pan or zoom.
    const drawn = new Set<string>();
    map.edges.forEach((e, i) => {
      const a = positions.get(e.fromNode);
      const b = positions.get(e.toNode);
      if (!a || !b) return;
      const direction = highlight?.edges.get(i);
      const fromSlot = compact ? null : rowSlot(e.fromNode, e.from);
      const toSlot = compact ? null : rowSlot(e.toNode, e.to);
      // Only files on screen are connected. A lit edge is the exception: a
      // selection never loses a connection, so its hidden end meets the header.
      const hot = hoveredPath !== null && (e.from === hoveredPath || e.to === hoveredPath);
      if (!compact && (fromSlot === null || toSlot === null) && !direction && !hot) return;
      if (onlyLit && !direction && !hot) return;
      // A compact card shows no files, so a link inside one folder would loop
      // from its header back to the same point: a stub that goes nowhere.
      if (compact && e.fromNode === e.toNode) return;

      // Coloured as a click would colour it, relative to the hovered file.
      const towards = hot ? (e.from === hoveredPath ? "out" : "in") : null;
      let opacity = 0;
      if (!towards && !direction) {
        const from = rowsByPath.get(e.from);
        const to = rowsByPath.get(e.to);
        const filteredOut = filtering && (!from || !to || !matches(from, filter) || !matches(to, filter));
        opacity = highlight ? 0.18 : filteredOut ? 0.2 : 0.9;
      }
      const look = towards ? `hot-${towards}` : direction ? `lit-${direction}` : `quiet-${opacity}`;
      const key = `${e.fromNode}:${fromSlot}>${e.toNode}:${toSlot}>${look}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      const d = edgePath(a, b, fromSlot, toSlot, e.fromNode === e.toNode);

      if (towards) {
        top.push(<path key={i} data-edge={i} d={d} stroke={DIRECTION_COLOR[towards]} strokeWidth={3} fill="none" />);
        return;
      }
      if (direction) {
        lit.push(<path key={i} data-edge={i} d={d} stroke={DIRECTION_COLOR[direction]} strokeWidth={2.5} fill="none" />);
        return;
      }
      quiet.push(<path key={i} data-edge={i} d={d} stroke="var(--edge)" strokeWidth={1} strokeOpacity={opacity} fill="none" className="transition-[stroke-opacity] duration-150" />);
    });
    return [...quiet, ...lit, ...top];
  }, [map.edges, positions, rowSlot, highlight, hovered, filtering, filter, rowsByPath, compact, onlyLit]);

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

  const bounds = useMemo(() => boundsOf(map.nodes, positions, compact), [map.nodes, positions, compact]);
  // The selection and everything it connects to.
  const litBounds = useMemo(
    () => (highlight ? boundsOf(map.nodes.filter((n) => highlight.nodes.has(n.id)), positions, compact) : null),
    [map.nodes, highlight, positions, compact],
  );

  // From where a running zoom is headed, so quick clicks add up rather than restart.
  const zoomBy = (factor: number) => {
    const v = glide.current?.to ?? viewport;
    const k = clampZoom(v.k * factor);
    const cx = size.w / 2;
    const cy = size.h / 2;
    glideTo({ k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) });
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerLeave={() => onHover(null)}
      className="relative min-w-0 flex-1 touch-none overflow-hidden bg-background select-none"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(148, 158, 175, 0.2) 1px, transparent 1.4px)",
        // Fixed to the screen, not the map: the same size at every zoom.
        backgroundSize: "24px 24px",
      }}
    >
      {/* No will-change here: it freezes the layer's pixels at the zoom it was
          painted at, and every card's text blurs once you zoom past it. */}
      <div
        className="absolute top-0 left-0 origin-top-left transition-opacity duration-300 ease-out starting:opacity-0"
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
            compact={compact}
            marks={marks}
            offset={offsets.get(n.id) ?? 0}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>

      <div data-overlay className="absolute top-3 left-1/2 -translate-x-1/2">
        {banner}
      </div>

      {/* Kept mounted so it can fade from and to its corner. */}
      <div
        data-overlay
        inert={!minimap}
        className={`absolute top-3 right-3 origin-top-right transition-[opacity,scale] duration-200 ease-out ${minimap ? "" : "pointer-events-none scale-95 opacity-0"}`}
      >
        <Minimap
          nodes={map.nodes}
          positions={positions}
          bounds={bounds}
          viewport={viewport}
          size={size}
          lit={highlight?.nodes ?? null}
          compact={compact}
          // A click glides there, like the other buttons that move the view.
          onCenter={(x, y) => {
            const k = (glide.current?.to ?? viewport).k;
            glideTo({ k, x: size.w / 2 - x * k, y: size.h / 2 - y * k });
          }}
          // A drag follows the hand, so never glides.
          onPan={(dx, dy) => {
            stopGlide();
            setViewport((v) => ({ ...v, x: v.x - dx * v.k, y: v.y - dy * v.k }));
          }}
        />
      </div>

      {children}

      <div
        data-overlay
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-surface p-1 shadow-[0_2px_10px_rgba(16,24,40,0.08)] ring-1 ring-border"
      >
        <ToolButton icon="undo" label="Reset card layout" disabled={positions === laidOut} onClick={() => arrange(setPositions, positions, laidOut, compact)} />
        <ToolButton icon="map" label="Minimap" active={minimap} onClick={() => setMinimap((m) => !m)} />
        <Divider />
        <ToolButton
          icon="fold"
          label={compact ? "Show files" : "Compact cards"}
          active={compact}
          onClick={() => {
            const next = !compact;
            const target = next ? compactPositions : fullPositions;
            setCompact(next);
            // Each card travels from where it is now to its place in the other view.
            arrange(next ? setCompactPositions : setFullPositions, positions, target, next);
            // The cards change size and place, so the old view would frame nothing in particular.
            glideTo(fit(boundsOf(map.nodes, target, next), size.w, size.h));
          }}
        />
        <ToolButton icon="links" label="Only the selection's links" active={onlyLit} onClick={() => setOnlyLit((o) => !o)} />
        <ToolButton
          icon="focus"
          label="Fit to selection"
          disabled={litBounds === null}
          onClick={() => litBounds && glideTo(fit(litBounds, size.w, size.h))}
        />
        <Divider />
        <ToolButton icon="zoomOut" label="Zoom out" onClick={() => zoomBy(1 / 1.2)} />
        <button
          type="button"
          title="Fit to screen"
          onClick={() => glideTo(fit(bounds, size.w, size.h))}
          className="w-12 rounded-md py-1.5 transition-[scale] duration-100 active:scale-95 text-center font-mono text-[11px] text-muted tabular-nums hover:bg-background"
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
  active,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  /** Only for toggles; an action button leaves it out. */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-lg transition-[scale] duration-100 enabled:active:scale-90 ${
        active ? "bg-accent/10 text-accent" : disabled ? "text-muted/40" : "text-muted hover:bg-background hover:text-foreground"
      }`}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}
