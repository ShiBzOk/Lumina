-- Phase 15: who mapped it, and what's new since you last looked.

-- ─── Who started an analysis ───────────────────────────────────────────────
-- The Clerk user id and the display name on their session token, both copied
-- when the run is started. The name is kept as it was then: nothing asks Clerk
-- again later, so a renamed person keeps their old name on old analyses.
-- Rows from before this phase have neither and are never given one; an author
-- is either wholly known or wholly absent.

alter table public.analyses
  add column started_by text,
  add column started_by_name text,
  add constraint analyses_author_whole check ((started_by is null) = (started_by_name is null));

-- ─── The user claim ────────────────────────────────────────────────────────
-- The Clerk user id is the token's subject. Read the same way the
-- organization claim is, and called inside a subselect for the same reason.

create function private.current_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() ->> 'sub'
$$;

grant execute on function private.current_user_id() to authenticated;

-- ─── Last visits ───────────────────────────────────────────────────────────
-- When a person last opened a map of a repository. One row per person per
-- repository, moved forward each time they open one. The organization is
-- carried so the policy can require it, and the composite key to projects
-- means a row can only name a repository of the organization it claims.

create table public.last_visits (
  org_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  user_id text not null,
  visited_at timestamptz not null,
  primary key (project_id, user_id),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);

alter table public.last_visits enable row level security;

create index last_visits_org_idx on public.last_visits (org_id);

-- Private to the person: their own row, in the organization they are signed
-- into, and nobody else's, not even a teammate's. Written as the person, so
-- these policies are the only thing deciding it. No delete: nothing removes a
-- visit but its repository going.

create policy "people read their own visits" on public.last_visits
  for select to authenticated
  using (
    user_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  );

create policy "people record their own visits" on public.last_visits
  for insert to authenticated
  with check (
    user_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  );

create policy "people move their own visits" on public.last_visits
  for update to authenticated
  using (
    user_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  )
  with check (
    user_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  );

grant select, insert, update on public.last_visits to authenticated;
