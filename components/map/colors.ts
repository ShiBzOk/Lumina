import type { Direction } from "@/lib/map/highlight";
import type { FileType } from "@/lib/map/model";

// Kind: one hue per sort of file, few enough to tell apart at a glance.
export const TYPE_COLOR: Record<FileType, string> = {
  react: "#db2777",
  typescript: "#2563eb",
  javascript: "#0891b2",
  component: "#7c3aed",
  css: "#c026d3",
  json: "#a16207",
  other: "#9ca3af",
};

// Direction: the only other thing that earns colour on the map.
export const DIRECTION_COLOR: Record<Direction, string> = {
  in: "var(--incoming)",
  out: "var(--outgoing)",
  internal: "var(--accent)",
};
