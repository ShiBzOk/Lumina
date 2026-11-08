-- Notifications, in the app only, about two things.

-- ─── Notifications ─────────────────────────────────────────────────────────
-- One row per person per event. Nothing in the app inserts one: the triggers
-- below decide who is told, when the note or the run's status is written.
--
-- The words a notification shows are copied in when it is made, the way a
-- note keeps its author's name: the repository, the path, the author, the
-- version. Nothing is looked up again to show it.
--
-- A note's notification goes with the note. A run's stays when its analysis
-- is pruned; the link to the analysis is then emptied, which is how the inbox
-- knows to say the version is no longer kept.

create type public.notification_kind as enum ('note', 'run_complete', 'run_failed');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  recipient_id text not null,
  kind public.notification_kind not null,
  project_id uuid not null,
  repo_owner text not null,
  repo_name text not null,
  -- A note: which one, on which path, by whom.
  note_id uuid references public.notes (id) on delete cascade,
  path text,
  actor_name text,
  -- A run: which analysis while it is kept, its version and branch always,
  -- and for a failure the reason it recorded, as it recorded it.
  analysis_id uuid references public.analyses (id) on delete set null,
  version integer,
  branch text,
  reason text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  -- One per new note per person.
  unique (note_id, recipient_id),
  check (
    (kind = 'note' and note_id is not null and path is not null and actor_name is not null and version is null)
    or (kind in ('run_complete', 'run_failed') and note_id is null and path is null and actor_name is null and version is not null)
  )
);

alter table public.notifications enable row level security;

-- The inbox reads a person's newest, and counts their unread.
create index notifications_recipient_idx on public.notifications (recipient_id, org_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id, org_id) where read_at is null;
create index notifications_org_idx on public.notifications (org_id);
create index notifications_project_idx on public.notifications (project_id, org_id);
create index notifications_analysis_idx on public.notifications (analysis_id);

-- Its own recipient, in the organization they are signed into. Signed into
-- another organization, they have none of this one's.
create policy "people read their own notifications" on public.notifications
  for select to authenticated
  using (
    recipient_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  );

-- Marking read is the only change a person makes, and only to their own.
create policy "people mark their own notifications read" on public.notifications
  for update to authenticated
  using (
    recipient_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  )
  with check (
    recipient_id = (select private.current_user_id())
    and org_id = (select private.current_org_id())
  );

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ─── A note on a path you have a note on ───────────────────────────────────
-- Everyone else with a note on the same path of the same repository is told,
-- once each. The author never is. Runs as its owner, because the person
-- writing the note may not write rows addressed to someone else; it is a
-- trigger, so nothing can call it but the insert itself. An edit is an update
-- and fires nothing.

create function private.notify_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (org_id, recipient_id, kind, project_id, repo_owner, repo_name, note_id, path, actor_name)
  select distinct new.org_id, n.author_id, 'note'::public.notification_kind, new.project_id, p.repo_owner, p.repo_name, new.id, new.path, new.author_name
  from public.notes n
  join public.projects p on p.id = new.project_id and p.org_id = new.org_id
  where n.project_id = new.project_id
    and n.org_id = new.org_id
    and n.path = new.path
    and n.id <> new.id
    and n.author_id <> new.author_id;
  return null;
end;
$$;

create trigger notes_notify
  after insert on public.notes
  for each row execute function private.notify_note();

-- ─── A run you started ends ────────────────────────────────────────────────
-- Told to whoever started it, which after a re-run is whoever re-ran it, the
-- moment its status becomes complete or failed. A run still going, or one that
-- stopped responding, has neither status and tells no one. Runs from before
-- authors were recorded have nobody to tell.

create function private.notify_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('complete', 'failed')
     and new.started_by is not null then
    insert into public.notifications (org_id, recipient_id, kind, project_id, repo_owner, repo_name, analysis_id, version, branch, reason)
    select new.org_id, new.started_by,
      case when new.status = 'complete' then 'run_complete'::public.notification_kind else 'run_failed'::public.notification_kind end,
      new.project_id, p.repo_owner, p.repo_name, new.id, new.version, new.branch,
      case when new.status = 'failed' then new.error end
    from public.projects p
    where p.id = new.project_id and p.org_id = new.org_id;
  end if;
  return null;
end;
$$;

create trigger analyses_notify
  after update on public.analyses
  for each row execute function private.notify_run();

-- ─── Telling the inbox something changed ───────────────────────────────────
-- A ping with nothing in it, on a private channel named for the organization
-- and the person, whenever one of their notifications is added, read or
-- removed. The inbox then asks for its count, through the policy above. One
-- ping per person per statement, so marking everything read is one ping.
-- Transition tables allow one event per trigger, hence three.

create function private.publish_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  for target in
    select distinct org_id, recipient_id from changed
  loop
    perform realtime.send('{}'::jsonb, 'changed', 'notifications:' || target.org_id || ':' || target.recipient_id, true);
  end loop;
  return null;
end;
$$;

create trigger notifications_publish_insert
  after insert on public.notifications
  referencing new table as changed
  for each statement execute function private.publish_notifications();

create trigger notifications_publish_update
  after update on public.notifications
  referencing new table as changed
  for each statement execute function private.publish_notifications();

create trigger notifications_publish_delete
  after delete on public.notifications
  referencing old table as changed
  for each statement execute function private.publish_notifications();

-- ─── Who may listen ────────────────────────────────────────────────────────
-- Only the person the channel is named for, signed into the organization it
-- is named for. No insert policy: browsers listen, only the database speaks.

create policy "people receive their own notification pings" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'notifications:' || (select private.current_org_id()) || ':' || (select private.current_user_id())
  );
