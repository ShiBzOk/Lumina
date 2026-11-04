import { DIRECTION_COLOR, TYPE_COLOR } from "@/components/map/colors";
import { Icon } from "@/components/map/icons";
import type { Direction } from "@/lib/map/highlight";
import { SELF_MAP } from "./self-map-data";

const { focus } = SELF_MAP;
const { card } = focus;
const PAD = 16;
const ROW_INSET = 6;

/**
 * Lumina's own map with one file selected, as `pnpm landing:map` wrote it: the
 * canvas's highlight, layout and edge curves, drawn flat in SVG so it scales
 * with the page. Nothing here is placed by hand.
 */
export function SelfMap() {
  const incoming = focus.edges.filter((e) => e.direction === "in").length;
  return (
    <figure className="overflow-hidden rounded-2xl bg-background shadow-[0_1px_2px_rgb(18_62_73/0.1),0_30px_60px_-24px_rgb(18_62_73/0.5)] ring-1 ring-petrol/10">
      <figcaption className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2.5 text-[11px] text-muted">
        <span className="truncate font-mono text-foreground">{focus.file}</span>
        <span className="flex shrink-0 gap-3 font-mono">
          <span className="text-incoming">{incoming} import it</span>
          <span className="text-outgoing">it imports {focus.edges.length - incoming}</span>
        </span>
      </figcaption>
      <svg
        viewBox={`${-PAD} ${-PAD} ${focus.width + PAD * 2} ${focus.height + PAD * 2}`}
        role="img"
        aria-label={`${focus.file} selected on Lumina's own dependency map, with the files it imports and the files that import it`}
        className="block h-auto w-full p-3 sm:p-6"
      >
        <g fill="none" strokeWidth={1.5}>
          {focus.edges.map((e) => (
            <path key={e.d} d={e.d} stroke={DIRECTION_COLOR[e.direction]} />
          ))}
        </g>
        {focus.nodes.map((n) => (
          <Card key={n.id} node={n} />
        ))}
      </svg>
    </figure>
  );
}

type Node = (typeof focus.nodes)[number];

function Card({ node }: { node: Node }) {
  const height = card.header + card.padding * 2 + node.rows.length * card.row;
  const shown = node.rows.length < node.total ? `${node.rows.length} of ${node.total} files` : `${node.total} files`;
  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <rect width={card.width} height={height} rx={16} fill="var(--surface)" stroke="var(--border)" />
      <line x1={0} x2={card.width} y1={card.header} y2={card.header} stroke="var(--border)" strokeOpacity={0.6} />
      <rect x={20} y={16} width={32} height={32} rx={8} fill="var(--background)" />
      <svg x={28} y={24} width={16} height={16} className="text-foreground/80">
        <Icon name="folder" className="size-4" />
      </svg>
      <text x={64} y={27} fontSize={13} fontWeight={600} className="fill-foreground">
        {node.label}
      </text>
      <text x={64} y={43} fontSize={10.5} className="fill-muted font-mono">
        {`${node.id}/`}
      </text>
      <text x={card.width - 20} y={36} fontSize={10.5} textAnchor="end" className="fill-muted font-mono">
        {shown}
      </text>
      {node.rows.map((r, i) => (
        <Row key={r.label} row={r} y={card.header + card.padding + i * card.row} />
      ))}
    </g>
  );
}

function Row({ row, y }: { row: Node["rows"][number]; y: number }) {
  const mid = y + card.row / 2;
  const width = card.width - ROW_INSET * 2;
  return (
    <g>
      {row.selected && (
        <rect x={ROW_INSET} y={y} width={width} height={card.row} rx={8} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeOpacity={0.4} />
      )}
      <Handle x={ROW_INSET + 7.5} y={mid} direction={row.left} />
      <Handle x={card.width - ROW_INSET - 7.5} y={mid} direction={row.right} />
      <circle cx={ROW_INSET + 23} cy={mid} r={3} fill={TYPE_COLOR[row.type]} />
      <text x={ROW_INSET + 35} y={mid} dominantBaseline="central" fontSize={12} className="fill-foreground font-mono">
        {row.label}
      </text>
      <text x={card.width - ROW_INSET - 20} y={mid} dominantBaseline="central" textAnchor="end" fontSize={10} className="font-mono">
        {row.fanIn > 0 && <tspan className="fill-incoming">{row.fanIn} in</tspan>}
        {row.fanIn > 0 && row.fanOut > 0 && " "}
        {row.fanOut > 0 && <tspan className="fill-outgoing">{row.fanOut} out</tspan>}
      </text>
    </g>
  );
}

function Handle({ x, y, direction }: { x: number; y: number; direction: Direction | null }) {
  return <circle cx={x} cy={y} r={3.5} fill={direction ? DIRECTION_COLOR[direction] : "#d4d8df"} />;
}
