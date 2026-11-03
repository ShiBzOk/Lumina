-- Phase 10: the model explains and labels.
--
-- Both caches are keyed on what the model was asked, never on a file row. A
-- re-analysis deletes and re-inserts every file, so a cache hanging off file
-- ids would empty itself on every run and nobody would ever feel it.

-- ─── Explanations ──────────────────────────────────────────────────────────
-- The phase 1 table hung off a file id and never had a writer; nothing is lost.
drop table public.explanations;

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  -- The exact snapshot that wrote it. Re-pinning the model misses only its own rows.
  model text not null,
  -- sha256 of everything the model is handed, with the file's content hash
  -- standing in for its source, so a changed file or neighbour misses.
  key text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (org_id, model, key)
);

alter table public.explanations enable row level security;

-- Read as the member asking: the cache lookup has no organization filter.
create policy "members read their organization's rows" on public.explanations
  for select to authenticated
  using (org_id = (select private.current_org_id()));

-- ─── Role labels ───────────────────────────────────────────────────────────
-- Only roles convention doesn't own. Page, route and controller decide the
-- route table and entry points, so the model may never write one.

create table public.role_labels (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  model text not null,
  key text not null,
  -- Null is an answer: the model couldn't say, and the file stays unlabelled.
  role text check (role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook')),
  created_at timestamptz not null default now(),
  unique (org_id, model, key)
);

-- No policy: only the pipeline reads this, and members see the labels through file_roles.
alter table public.role_labels enable row level security;

alter table public.file_roles
  add constraint file_roles_model_role_check
    check (source = 'adapter' or role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook'));

-- ─── Labelling stage ───────────────────────────────────────────────────────
alter type public.analysis_stage add value 'labelling' after 'storing';
