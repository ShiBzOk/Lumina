"use client";

import type { ReactNode } from "react";
import { sameSelection, type Selection } from "@/lib/map/highlight";

// The model is allowed inline code, bullets and bold, and this renders exactly
// those. Anything else it writes anyway (a heading, an italic) loses its marks
// rather than showing them. A path is a link only when it names a real file or
// a folder on the map; anything else the model calls a path stays text.

type Inline = { kind: "text"; text: string } | { kind: "code"; text: string } | { kind: "bold"; children: Inline[] };
type Block = { kind: "p"; inline: Inline[] } | { kind: "ul"; items: Inline[][] };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseProse(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] | null = null;
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "p", inline: parseInline(paragraph.join(" ")) });
    if (items) blocks.push({ kind: "ul", items: items.map(parseInline) });
    paragraph = [];
    items = null;
  };
  for (const line of body.split(/\r?\n/)) {
    const bullet = BULLET.exec(line);
    const heading = HEADING.exec(line);
    if (line.trim() === "") flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "p", inline: [{ kind: "bold", children: parseInline(heading[1]) }] });
    } else if (bullet) {
      if (paragraph.length > 0) flush();
      (items ??= []).push(bullet[1]);
    } else if (items) items[items.length - 1] += ` ${line.trim()}`;
    else paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ kind: "text", text: clean(text.slice(at, m.index)) });
    out.push(m[1] !== undefined ? { kind: "code", text: m[1] } : { kind: "bold", children: parseInline(m[2]) });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: clean(text.slice(at)) });
  return out;
}

// What's left of markup nobody permitted: italics and unpaired marks.
function clean(text: string): string {
  return text.replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s.,;:!?)]|$)/g, "$1$2").replace(/[`*]/g, "");
}

interface ProseProps {
  body: string;
  files: ReadonlySet<string>;
  folders: ReadonlySet<string>;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}

export function Prose({ body, className = "text-[11.5px] leading-relaxed", ...links }: ProseProps & { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {parseProse(body).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{renderInline(b.inline, links)}</p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-4 marker:text-muted">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, links)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

type Links = Omit<ProseProps, "body">;

function renderInline(inline: Inline[], links: Links): ReactNode[] {
  return inline.map((part, i) => {
    if (part.kind === "bold") return <strong key={i} className="font-semibold">{renderInline(part.children, links)}</strong>;
    if (part.kind === "code") {
      const target = resolve(part.text.trim(), links);
      return target ? (
        <PathLink key={i} target={target} text={part.text} {...links} />
      ) : (
        <code key={i} className="rounded bg-background px-1 font-mono text-[10.5px] [overflow-wrap:anywhere] ring-1 ring-border box-decoration-clone">
          {part.text}
        </code>
      );
    }
    return <span key={i}>{linkWords(part.text, links)}</span>;
  });
}

/** A file, or a folder that is a box on the map. Line suffixes and a leading ./ are tolerated. */
function resolve(raw: string, { files, folders }: Links): Selection {
  const p = raw.replace(/^\.\//, "").replace(/:\d+(?::\d+)?$/, "");
  if (files.has(p)) return { kind: "file", path: p };
  const dir = p.replace(/\/$/, "");
  if (dir !== "" && dir !== "." && folders.has(dir)) return { kind: "node", id: dir };
  return null;
}

// Paths can hold brackets and parentheses (app/[id]/page.tsx), so punctuation
// is peeled off a word a little at a time until something real is left.
function linkWords(text: string, links: Links): ReactNode[] {
  return text.split(/(\s+)/).map((word, i) => {
    if (!word.includes("/") && !word.includes(".")) return word;
    for (let start = 0; start < Math.min(3, word.length); start++) {
      for (let end = word.length; end > start && word.length - end < 4; end--) {
        const target = resolve(word.slice(start, end), links);
        if (target) {
          return (
            <span key={i}>
              {word.slice(0, start)}
              <PathLink target={target} text={word.slice(start, end)} {...links} />
              {word.slice(end)}
            </span>
          );
        }
      }
    }
    return word;
  });
}

// A span, not a <button>: a button is always laid out as an inline-block, so a
// long path inside a sentence dropped onto its own line and left the
// brackets around it stranded on the lines above and below. This wraps with
// the text instead, and only breaks a path where it has to.
function PathLink({ target, text, hovered, onSelect, onHover }: { target: NonNullable<Selection>; text: string } & Links) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={target.kind === "file" ? target.path : `${target.id}/`}
      onClick={() => onSelect(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(target);
        }
      }}
      onMouseEnter={() => onHover(target)}
      onMouseLeave={() => onHover(null)}
      className={`cursor-pointer rounded px-0.5 font-mono text-[10.5px] text-accent underline decoration-accent/30 underline-offset-2 [overflow-wrap:anywhere] box-decoration-clone hover:decoration-accent ${
        sameSelection(hovered, target) ? "bg-accent/10" : ""
      }`}
    >
      {text}
    </span>
  );
}
