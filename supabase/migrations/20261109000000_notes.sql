-- Phase 16: plain notes left on a file for the next person who opens the map.

-- ─── The name claim ────────────────────────────────────────────────────────
-- The person's display name, as it is on their session token. A note's author
-- name has to equal it when the note is written, so the name a note carries is
-- the one the token vouches for and not whatever a caller typed.

create function private.current_user_name()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() ->> 'user_name'
$$;

grant execute on function private.current_user_name() to authenticated;

-- ─── Notes ─────────────────────────────────────────────────────────────────
-- A note belongs to an organization, a repository and a path. Not to an
-- analysis and not to a file id: both change on every re-analysis, and a note
-- must outlive them. A path no analysis contains any more simply has notes
-- that are shown as orphaned; nothing here deletes them but their author.
--
-- The author's id and name are copied when the note is written and never
-- looked up again, so a note outlives its author leaving the organization.
-- Plain text only, within a length limit the table itself enforces.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  path text not null check (path <> ''),
  author_id text not null,
  author_name text not null,
  body text not null check (body = btrim(body) and char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- Null until the note is edited.
  edited_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);

alter table public.notes enable row level security;

-- Read once per map, a repository at a time, newest first.
create index notes_project_idx on public.notes (project_id, created_at desc);
create index notes_org_idx on public.notes (org_id);

-- Anyone in the organization reads every note of its repositories.
create policy "members read their organization's notes" on public.notes
  for select to authenticated
  using (org_id = (select private.current_org_id()));

-- Writing is as the person, and only as themselves: the author is the token's
-- subject, the name is the token's name, the organization is the token's. The
-- repository's composite key means the note can only name a repository of the
-- organization it claims.
create policy "people write their own notes" on public.notes
  for insert to authenticated
  with check (
    org_id = (select private.current_org_id())
    and author_id = (select private.current_user_id())
    and author_name = (select private.current_user_name())
  );

-- Changing or removing a note takes being its author, in its organization. A
-- teammate's note can't be reached by any route: the policy returns no row to
-- change.
create policy "people edit their own notes" on public.notes
  for update to authenticated
  using (
    org_id = (select private.current_org_id())
    and author_id = (select private.current_user_id())
  )
  with check (
    org_id = (select private.current_org_id())
    and author_id = (select private.current_user_id())
  );

create policy "people delete their own notes" on public.notes
  for delete to authenticated
  using (
    org_id = (select private.current_org_id())
    and author_id = (select private.current_user_id())
  );

-- Column grants carry what a policy can't say: an edit changes the words and
-- nothing else, so a note can't be moved to another path, repository or
-- author.
grant select on public.notes to authenticated;
grant insert (org_id, project_id, path, author_id, author_name, body) on public.notes to authenticated;
grant update (body, edited_at) on public.notes to authenticated;
grant delete on public.notes to authenticated;
