-- The pipeline: analyses now come from a real run, so the tables hold what the
-- parser actually returns, a run records which stage it is in, and that stage
-- is published to a per-analysis realtime channel.

-- ─── Projects ──────────────────────────────────────────────────────────────

-- GitHub's own description, copied when the archive is fetched.
alter table public.projects add column description text;

-- ─── Analyses ──────────────────────────────────────────────────────────────

create type public.analysis_stage as enum ('fetching', 'selecting', 'parsing', 'storing');

alter table public.analyses
  -- What was asked for; null means the repository's default branch.
  add column branch text,
  -- The stage in progress, or for a failed run the stage it failed in.
  add column stage public.analysis_stage,
  add column stage_message text,
  -- Moved by trigger whenever status, stage or message changes, so an
  -- unfinished run that stopped moving is detectable as stale.
  add column stage_changed_at timestamptz not null default now(),
  add column adapter text,
  -- The parser's coverage report, as written. Read whole, never queried into.
  add column coverage jsonb,
  add column file_count integer,
  add column package_count integer,
  -- One analysis per repository. Enforced here so two tabs submitting the
  -- same URL at once still produce one row.
  add constraint analyses_one_per_project unique (project_id);

-- ─── Files ─────────────────────────────────────────────────────────────────
-- Everything the parser says about a file. Line count is null for binary
-- assets, which have no lines.

alter table public.files
  alter column line_count drop not null,
  add column folder text not null,
  add column package text,
  add column kind text not null check (kind in ('source', 'asset')),
  add column bytes integer not null,
  add column fan_in integer not null,
  add column fan_out integer not null;

-- ─── Edges ─────────────────────────────────────────────────────────────────
-- The parser emits one edge per ordered file pair with every kind of import
-- behind it, so kind becomes a list in the parser's own vocabulary.

alter table public.edges
  drop column kind,
  add column kinds text[] not null
    check (cardinality(kinds) > 0 and kinds <@ array['import', 're-export', 'dynamic-import']),
  add column type_only boolean not null;

-- ─── Imports ───────────────────────────────────────────────────────────────
-- Every import statement the parser saw, edge or not, with what it resolved
-- to and why. The target is a path rather than a file id because an excluded
-- import points at a file that is deliberately not a node.

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  specifier text not null,
  kind text not null check (kind in ('import', 're-export', 'dynamic-import')),
  type_only boolean not null,
  line integer not null,
  status text not null check (status in ('internal', 'external', 'excluded', 'unresolved')),
  reason text,
  target text,
  detail text,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade,
  -- Each status carries exactly the fields the parser gives it.
  check (
    (status = 'internal' and reason is null and target is not null and detail is null)
    or (status = 'external' and reason is not null and target is null and detail is not null)
    or (status = 'excluded' and reason is not null and target is not null and detail is not null)
    or (status = 'unresolved' and reason is not null and target is null and detail is not null)
  )
);

alter table public.imports enable row level security;

create index imports_analysis_idx on public.imports (analysis_id, org_id);
create index imports_file_idx on public.imports (file_id, org_id);
create index files_analysis_idx on public.files (analysis_id, org_id);

create policy "members read their organization's rows" on public.imports
  for select to authenticated
  using (org_id = (select private.current_org_id()));

-- ─── Stage timestamp ───────────────────────────────────────────────────────

create function private.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    or new.stage is distinct from old.stage
    or new.stage_message is distinct from old.stage_message then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger analyses_touch_stage_changed_at
  before update on public.analyses
  for each row execute function private.touch_stage_changed_at();

-- ─── Publishing the stage ──────────────────────────────────────────────────
-- A trigger on our own table, never on realtime's. It sends the stage and its
-- message, plus the status so a page knows when the run has ended — not the
-- row, so a subscriber has nothing to filter or interpret. The channel is
-- private: who may receive it is the policy below.

create function private.publish_analysis_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    or new.stage is distinct from old.stage
    or new.stage_message is distinct from old.stage_message then
    perform realtime.send(
      jsonb_build_object(
        'status', new.status,
        'stage', new.stage,
        'message', case when new.status = 'failed' then new.error else new.stage_message end
      ),
      'stage',
      'analysis:' || new.id::text,
      true
    );
  end if;
  return null;
end;
$$;

create trigger analyses_publish_stage
  after update on public.analyses
  for each row execute function private.publish_analysis_stage();

-- ─── Who may subscribe ─────────────────────────────────────────────────────
-- Registers the analysis:<id> channel pattern. A member may join an analysis
-- channel only when that analysis is one their organization can read, so
-- another organization's progress stream is refused the same way its rows are.
-- No insert policy: browsers listen, only the database publishes.

create policy "members receive their organization's analysis stages" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'analysis:%'
    and exists (
      select 1 from public.analyses a
      where a.id::text = split_part(realtime.topic(), ':', 2)
        and a.org_id = (select private.current_org_id())
    )
  );
