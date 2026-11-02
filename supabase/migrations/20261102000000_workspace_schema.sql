-- The workspace schema. Every row belongs to an organization, and the only
-- thing deciding who reads it is a policy comparing that organization to the
-- one on the caller's Clerk token.

-- ─── Row-level security on by default ──────────────────────────────────────
-- A table with RLS and no policy returns nothing, which is visible. A table
-- someone forgot to enable it on returns everything, silently. This trigger
-- makes the second case impossible for any table created in public from here
-- on, including ones created by later migrations. It lives outside public so
-- the API never exposes it.

create schema if not exists private;

create function private.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);
  end loop;
end;
$$;

create event trigger enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_tables();

-- ─── The organization claim ────────────────────────────────────────────────
-- Clerk's v2 session token carries the active organization at o.id. Wrapped
-- in a function so every policy reads it the same way; policies call it inside
-- a subselect so Postgres evaluates it once per query rather than per row.

create function private.current_org_id()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() -> 'o' ->> 'id'
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_org_id() to authenticated;

-- ─── Tables ────────────────────────────────────────────────────────────────
-- Children reference their parent by (id, org_id) together, so a row can't
-- claim one organization while pointing at another organization's parent.
-- Every table also references organizations directly, so deleting an
-- organization removes everything it owns.

-- Mirrors a Clerk organization. The id is Clerk's, so the token claim and the
-- foreign key are the same value.
create table public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- A repository an organization has mapped. Mapped once, shared by everyone in
-- the organization.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  repo_owner text not null,
  repo_name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, repo_owner, repo_name),
  unique (id, org_id)
);

create type public.analysis_status as enum ('queued', 'running', 'complete', 'failed');

-- One run of the parser over one commit of a project.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  status public.analysis_status not null default 'queued',
  commit_sha text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  unique (id, org_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  line_count integer not null,
  content_hash text not null,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  unique (analysis_id, path),
  unique (id, org_id)
);

-- Only ever written for an import the parser resolved to a real file.
create table public.edges (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind text not null check (kind in ('import', 're-export', 'dynamic', 'require')),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (source_file_id, org_id) references public.files (id, org_id) on delete cascade,
  foreign key (target_file_id, org_id) references public.files (id, org_id) on delete cascade
);

-- Only ever written when both method and pattern were recovered exactly.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  pattern text not null,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade
);

-- Keyed by the content hash it was generated from, so a changed file is
-- detectably stale rather than silently wrong.
create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  file_id uuid not null,
  content_hash text not null,
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade,
  unique (file_id, content_hash)
);

-- Where the role came from is kept, because an adapter's convention match and
-- a model's label are not equally certain.
create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  file_id uuid not null,
  role text not null,
  source text not null check (source in ('adapter', 'model')),
  foreign key (file_id, org_id) references public.files (id, org_id) on delete cascade,
  unique (file_id)
);

-- Facts about the edge list. The files involved are listed in detail because
-- a cycle names several.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  kind text not null,
  detail jsonb not null,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade
);

-- Stated explicitly as well, so this file alone shows all eight are covered.
alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

-- ─── Indexes ───────────────────────────────────────────────────────────────
-- org_id leads where a policy filters on it; the rest cover foreign keys
-- Postgres doesn't index on its own.

create index analyses_org_created_idx on public.analyses (org_id, created_at desc);
create index analyses_project_idx on public.analyses (project_id, org_id);
create index files_org_idx on public.files (org_id);
create index edges_analysis_idx on public.edges (analysis_id, org_id);
create index edges_source_idx on public.edges (source_file_id, org_id);
create index edges_target_idx on public.edges (target_file_id, org_id);
create index routes_analysis_idx on public.routes (analysis_id, org_id);
create index routes_file_idx on public.routes (file_id, org_id);
create index explanations_org_idx on public.explanations (org_id);
create index file_roles_org_idx on public.file_roles (org_id);
create index insights_analysis_idx on public.insights (analysis_id, org_id);

-- ─── Policies ──────────────────────────────────────────────────────────────
-- Read only. Nothing in the app writes yet, and a write policy added before
-- there's a writer is a door nobody is watching. Anonymous callers get no
-- policy at all, so they read nothing.

create policy "members read their organization" on public.organizations
  for select to authenticated
  using (id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.projects
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.analyses
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.files
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.edges
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.routes
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.explanations
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.file_roles
  for select to authenticated
  using (org_id = (select private.current_org_id()));

create policy "members read their organization's rows" on public.insights
  for select to authenticated
  using (org_id = (select private.current_org_id()));
