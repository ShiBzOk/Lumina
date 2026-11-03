// Where each box sits. Pure and deterministic: every tie is broken by id, so
// the same data produces the same picture every time.

/** Card geometry, shared with the canvas so edge anchors and cards agree. */
export const CARD_WIDTH = 340;
export const HEADER_HEIGHT = 64;
export const ROW_HEIGHT = 40;
export const LIST_PADDING = 10;
export const MAX_VISIBLE_ROWS = 8;
const GAP_X = 140;
const GAP_Y = 56;

/** A compact card is its header alone. */
export function cardHeight(rows: number, compact = false): number {
  return compact ? HEADER_HEIGHT : HEADER_HEIGHT + LIST_PADDING * 2 + Math.min(rows, MAX_VISIBLE_ROWS) * ROW_HEIGHT;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The curve for one connection, from the importer's card at `a` to the
 * target's at `b`. A null slot is a file not on screen: that end meets the
 * card's header. One function, so a card being animated and a card at rest
 * draw their edges identically.
 */
export function edgePath(a: Point, b: Point, fromSlot: number | null, toSlot: number | null, sameNode: boolean): string {
  const rowY = (slot: number | null) => (slot === null ? HEADER_HEIGHT / 2 : HEADER_HEIGHT + LIST_PADDING + slot * ROW_HEIGHT + ROW_HEIGHT / 2);
  const x1 = a.x + CARD_WIDTH;
  const y1 = a.y + rowY(fromSlot);
  const y2 = b.y + rowY(toSlot);
  // Within one folder the curve loops out of the right side and back in;
  // between folders it leaves the importer's right and enters the target's left.
  const x2 = sameNode ? x1 : b.x;
  // A link back to a column on the left (a cycle) bends tightly: scaled to
  // the distance, it would swing far out past the cards into empty canvas.
  const dx = sameNode ? 36 + Math.abs(y2 - y1) * 0.25 : x2 > x1 ? Math.max(60, (x2 - x1) * 0.5) : 60;
  return `M${x1},${y1} C${x1 + dx},${y1} ${sameNode ? x2 + dx : x2 - dx},${y2} ${x2},${y2}`;
}

export interface NodeLink {
  from: string;
  to: string;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Layered left to right: importers on the left, what they import on the right.
 * Cycles are broken by ignoring the edges a depth-first walk finds pointing
 * back, layers come from the longest path, order within a layer from a few
 * barycentre sweeps.
 */
export function layout(nodes: readonly { id: string; height: number }[], links: readonly NodeLink[]): Map<string, Point> {
  const ids = nodes.map((n) => n.id).toSorted(byId);
  const height = new Map(nodes.map((n) => [n.id, n.height]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const l of links) if (l.from !== l.to) out.get(l.from)?.push(l.to);
  for (const list of out.values()) list.sort(byId);

  // Depth-first from every node in id order; an edge into a node still on the
  // stack closes a cycle and is left out of the layering.
  const state = new Map<string, "open" | "done">();
  const forward = new Map<string, string[]>(ids.map((id) => [id, []]));
  const finished: string[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const to of out.get(id) ?? []) {
      const s = state.get(to);
      if (s === "open") continue;
      forward.get(id)?.push(to);
      if (s === undefined) visit(to);
    }
    state.set(id, "done");
    finished.push(id);
  };
  for (const id of ids) if (!state.has(id)) visit(id);

  // Reverse finishing order is a topological order of the forward edges.
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const id of finished.toReversed()) {
    for (const to of forward.get(id) ?? []) layer.set(to, Math.max(layer.get(to) ?? 0, (layer.get(id) ?? 0) + 1));
  }

  // Longest path piles every importer with no importers of its own into the
  // first column. Pulling each one right to just before its nearest target
  // keeps it next to what it uses instead of stacking a tower on the left.
  const hasImporter = new Set([...forward.values()].flat());
  for (const id of ids) {
    const targets = forward.get(id) ?? [];
    if (hasImporter.has(id) || targets.length === 0) continue;
    layer.set(id, Math.min(...targets.map((t) => layer.get(t) ?? 0)) - 1);
  }

  const layerCount = Math.max(0, ...layer.values()) + 1;
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  for (const id of ids) layers[layer.get(id) ?? 0].push(id);

  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const l of links) {
    if (l.from === l.to) continue;
    neighbours.get(l.from)?.push(l.to);
    neighbours.get(l.to)?.push(l.from);
  }
  const rank = new Map<string, number>();
  const rerank = () => layers.forEach((col) => col.forEach((id, i) => rank.set(id, i / Math.max(1, col.length - 1))));
  rerank();
  for (let sweep = 0; sweep < 6; sweep++) {
    for (const col of layers) {
      const centre = new Map(
        col.map((id) => {
          const ns = (neighbours.get(id) ?? []).filter((n) => layer.get(n) !== layer.get(id));
          return [id, ns.length ? ns.reduce((s, n) => s + (rank.get(n) ?? 0), 0) / ns.length : (rank.get(id) ?? 0)];
        }),
      );
      col.sort((a, b) => (centre.get(a) ?? 0) - (centre.get(b) ?? 0) || byId(a, b));
    }
    rerank();
  }

  // A layer taller than the map is wide splits into side-by-side columns,
  // dealt out alternately so each keeps the layer's top-to-bottom order.
  const cap = Math.max(4, Math.ceil(Math.sqrt(ids.length)));
  const columns = layers.flatMap((col) => {
    const split = Math.ceil(col.length / cap);
    return Array.from({ length: split }, (_, s) => col.filter((_, i) => i % split === s));
  });

  // Columns are stacked top to bottom and centred on a shared middle line.
  const heights = columns.map((col) => col.reduce((h, id) => h + (height.get(id) ?? 0), 0) + GAP_Y * (col.length - 1));
  const tallest = Math.max(0, ...heights);
  const positions = new Map<string, Point>();
  columns.forEach((col, c) => {
    let y = (tallest - heights[c]) / 2;
    for (const id of col) {
      positions.set(id, { x: c * (CARD_WIDTH + GAP_X), y });
      y += (height.get(id) ?? 0) + GAP_Y;
    }
  });
  return positions;
}
