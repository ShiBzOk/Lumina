"use client";

import { useState, type ReactNode } from "react";
import type { NotesResult } from "@/app/analyses/actions";
import { NOTE_LIMIT, stampMatch, type Note, type StampMatch } from "@/lib/map/notes";
import type { Selection } from "@/lib/map/highlight";
import { Icon } from "./icons";

/** What a write does to the workspace's list: the fresh list, or the reason it didn't happen. */
export interface NoteActions {
  add: (path: string, body: string) => Promise<NotesResult>;
  edit: (id: string, body: string) => Promise<NotesResult>;
  remove: (id: string) => Promise<NotesResult>;
}

interface NotesProps {
  selection: Selection;
  /** Every note of the repository, newest first. */
  notes: readonly Note[];
  /** Files of the analysis on screen. A note on any other path is shown as no longer in it. */
  files: ReadonlyMap<string, { sha256: string }>;
  me: string;
  actions: NoteActions;
}

// Drawn like a `git log` of the path: one node per note on a rail, newest at
// the top, a short id and the author as the header, the words as the message.
// Neutral throughout: colour on this map already means something.

/**
 * Notes belong to a file by its path, so this shows them for the selected file
 * or, with nothing selected, the ones whose file isn't in this analysis. They
 * are plain text: nothing here renders markup or turns a path into a link,
 * and nothing here is handed to a model.
 */
export function Notes({ selection, notes, files, me, actions }: NotesProps) {
  if (selection?.kind === "node") {
    return <Hint>Notes belong to files. Select a file in this folder to read or leave one.</Hint>;
  }

  if (selection?.kind === "file") {
    const path = selection.path;
    const mine = notes.filter((n) => n.path === path);
    return (
      <div className="flex min-h-full flex-col">
        <div className="min-h-0 flex-1 px-3 pt-3 pb-2">
          <LogHeader path={path} count={mine.length} />
          {mine.length === 0 ? (
            <p className="mt-3 border-l border-dashed border-border py-1 pl-3 font-mono text-[11px] text-muted">
              no notes on this path yet
            </p>
          ) : (
            <Log notes={mine} files={files} me={me} actions={actions} />
          )}
        </div>
        <Composer key={path} onAdd={(body) => actions.add(path, body)} />
      </div>
    );
  }

  const orphaned = notes.filter((n) => !files.has(n.path));
  if (orphaned.length === 0) {
    return <Hint>Select a file to read or leave a note on it. Notes stay with the file&apos;s path across analyses.</Hint>;
  }
  // Grouped under their paths, in the order the newest note on each puts them.
  const byPath = Map.groupBy(orphaned, (n) => n.path);
  return (
    <div className="px-3 pt-3 pb-3">
      <div className="flex items-baseline gap-2 font-mono text-[11px]">
        <span className="font-semibold">No longer in this analysis</span>
        <span className="flex-1" />
        <span className="text-muted tabular-nums">{byPath.size} {byPath.size === 1 ? "path" : "paths"}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        A file that moved is a file removed and another added, so its notes stay on the old path.
      </p>
      {[...byPath].map(([path, group]) => (
        <section key={path} className="mt-4">
          <LogHeader path={path} count={group.length} gone />
          <Log notes={group} files={files} me={me} actions={actions} />
        </section>
      ))}
    </div>
  );
}

function LogHeader({ path, count, gone = false }: { path: string; count: number; gone?: boolean }) {
  return (
    <PathStrip path={path} gone={gone}>
      {count} {count === 1 ? "note" : "notes"}
    </PathStrip>
  );
}

/** The `@ path` strip that heads the Notes and Explanation tabs: folder muted, name bold, a word about it on the right. */
export function PathStrip({ path, gone = false, children }: { path: string; gone?: boolean; children?: ReactNode }) {
  const slash = path.lastIndexOf("/", path.endsWith("/") ? path.length - 2 : path.length);
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5 font-mono text-[11px] ring-1 ring-border">
      <span className="shrink-0 text-muted">{gone ? "−" : "@"}</span>
      <p className="min-w-0 flex-1 truncate" dir="rtl" title={path}>
        <bdi>
          <span className="text-muted">{path.slice(0, slash + 1)}</span>
          <span className={`font-semibold ${gone ? "text-muted" : ""}`}>{path.slice(slash + 1)}</span>
        </bdi>
      </p>
      {children !== undefined && <span className="shrink-0 text-[10px] text-muted tabular-nums">{children}</span>}
    </div>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <div className="flex flex-col items-center px-8 pt-24 text-center">
      <Icon name="note" className="size-7 text-muted/60" />
      <p className="mt-3 text-xs font-semibold">No file selected</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Log({
  notes,
  files,
  me,
  actions,
}: {
  notes: readonly Note[];
  files: ReadonlyMap<string, { sha256: string }>;
  me: string;
  actions: NoteActions;
}) {
  return (
    <ol className="relative mt-3">
      {/* The rail: stops at the last node rather than running past it. */}
      <span aria-hidden className="absolute top-2 bottom-4 left-[4px] w-px bg-border" />
      {notes.map((n) => (
        <Entry key={n.id} note={n} match={stampMatch(n, files.get(n.path))} mine={n.authorId === me} actions={actions} />
      ))}
    </ol>
  );
}

function Entry({ note, match, mine, actions }: { note: Note; match: StampMatch | null; mine: boolean; actions: NoteActions }) {
  const [mode, setMode] = useState<"read" | "edit" | "confirm">("read");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The workspace replaces its list with whatever a write returns, which drops
  // or updates this entry; only a refusal comes back here.
  const run = async (write: () => Promise<NotesResult>, done: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = await write();
      if (result.ok) done();
      else setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="group relative pb-4 pl-5 last:pb-1">
      {/* Your own notes are a filled node, everyone else's hollow: the one thing the shape says. */}
      <span
        aria-hidden
        className={`absolute top-[5px] left-0 size-[9px] rounded-full ring-2 ring-surface ${
          mine ? "bg-foreground/70" : "border border-muted/70 bg-surface"
        }`}
      />
      <div className="flex items-baseline gap-1.5 font-mono text-[10.5px] leading-4">
        <span className="shrink-0 text-muted" title={`note ${note.id}`}>
          {note.id.slice(0, 7)}
        </span>
        <span className="min-w-0 truncate font-semibold text-foreground">{note.authorName}</span>
        <span className="flex-1" />
        <span className="shrink-0 text-muted" title={note.edited ? `written ${note.created.exact} · edited ${note.edited.exact}` : note.created.exact}>
          {note.created.relative}
          {note.edited && "*"}
        </span>
      </div>

      {note.stamp && match && <Stamp version={note.stamp.version} match={match} />}

      {mode === "edit" ? (
        <Editor
          initial={note.body}
          submit="Save"
          busy={busy}
          onCancel={() => {
            setMode("read");
            setError(null);
          }}
          onSubmit={(body) => run(() => actions.edit(note.id, body), () => setMode("read"))}
        />
      ) : (
        <p className="mt-1 font-mono text-[11.5px] leading-[1.55] break-words whitespace-pre-wrap text-foreground/85">{note.body}</p>
      )}

      {mine && mode === "read" && (
        <div className="mt-1 flex gap-3 font-mono text-[10.5px] text-muted">
          <button type="button" onClick={() => setMode("edit")} className="hover:text-foreground">
            edit
          </button>
          <button type="button" onClick={() => setMode("confirm")} className="hover:text-foreground">
            delete
          </button>
        </div>
      )}
      {mine && mode === "confirm" && (
        <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px]">
          <span className="text-muted">delete this note?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => actions.remove(note.id), () => undefined)}
            className="rounded px-1 font-medium text-danger ring-1 ring-danger/30 hover:bg-danger/5 disabled:opacity-50"
          >
            y
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("read")} className="rounded px-1 text-muted ring-1 ring-border hover:text-foreground">
            n
          </button>
        </div>
      )}
      {error && <p className="mt-1 font-mono text-[10.5px] break-words text-danger">{error}</p>}
    </li>
  );
}

// Facts only: which version the note was written against and whether the
// file's content hash here is the same. Never what changed, nor whether the
// note is still right. Weight, not colour, is what sets "differs" apart.
const STAMP: Record<StampMatch, { text: string; tip: (v: number) => string }> = {
  same: { text: "same content here", tip: (v) => `This file's content here is identical to Version ${v}, when this note was written` },
  differs: { text: "content differs here", tip: (v) => `This file's content here is not the same as in Version ${v}, when this note was written` },
  absent: { text: "", tip: (v) => `Written against Version ${v}` },
};

function Stamp({ version, match }: { version: number; match: StampMatch }) {
  return (
    <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] leading-4 text-muted" data-tip={STAMP[match].tip(version)}>
      <span>on v{version}</span>
      {match !== "absent" && (
        <>
          <span aria-hidden>{match === "same" ? "=" : "≠"}</span>
          <span className={match === "differs" ? "font-semibold text-foreground" : ""}>{STAMP[match].text}</span>
        </>
      )}
    </p>
  );
}

function Composer({ onAdd }: { onAdd: (body: string) => Promise<NotesResult> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  return (
    <div className="sticky bottom-0 border-t border-border bg-surface px-3 pt-2.5 pb-3">
      <Editor
        // Re-keyed after a save so the box empties; a refusal keeps what was typed.
        key={fresh}
        initial=""
        submit="Add note"
        busy={busy}
        placeholder={"Why is this file the way it is?\nWhat should the next person know?"}
        onSubmit={async (body) => {
          setBusy(true);
          setError(null);
          try {
            const result = await onAdd(body);
            if (result.ok) setFresh((n) => n + 1);
            else setError(result.error);
          } catch (e) {
            setError(e instanceof Error ? e.message : "The request failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <p className="mt-1.5 font-mono text-[10.5px] break-words text-danger">{error}</p>}
    </div>
  );
}

function Editor({
  initial,
  submit,
  busy,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  submit: string;
  busy: boolean;
  placeholder?: string;
  onSubmit: (body: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const length = [...text.trim()].length;
  const over = length > NOTE_LIMIT;
  const ready = !busy && length > 0 && !over;
  const send = () => {
    if (ready) void onSubmit(text);
  };
  return (
    <div className="mt-1.5 overflow-hidden rounded-md bg-background ring-1 ring-border focus-within:ring-accent/50">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        rows={3}
        disabled={busy}
        aria-label="Note"
        className="block w-full resize-y bg-transparent px-2.5 py-2 font-mono text-[11.5px] leading-[1.55] outline-none placeholder:text-muted/80 disabled:opacity-60"
      />
      <div className="flex items-center gap-2 border-t border-border bg-surface px-2 py-1.5 font-mono text-[10px] text-muted">
        <span className={`tabular-nums ${over ? "text-danger" : ""}`}>
          {length}/{NOTE_LIMIT}
        </span>
        <span className="flex-1" />
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="hover:text-foreground">
            cancel <Kbd>esc</Kbd>
          </button>
        )}
        <button
          type="button"
          disabled={!ready}
          onClick={send}
          className="flex items-center gap-1.5 rounded bg-foreground px-2 py-1 text-[10.5px] font-medium text-surface hover:bg-foreground/85 disabled:opacity-35"
        >
          {busy ? "saving…" : submit.toLowerCase()}
          <span className="opacity-60">ctrl ↵</span>
        </button>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <span className="rounded px-1 ring-1 ring-border">{children}</span>;
}
