-- A note records the file it was written against.

-- The analysis version on screen and the file's content hash in it, copied
-- when the note is written or edited. Notes from before this have neither and
-- are never given one; a stamp is either whole or absent.

alter table public.notes
  add column written_version integer,
  add column content_hash text,
  add constraint notes_stamp_whole check ((written_version is null) = (content_hash is null));

-- A stamp has to be one a stored analysis of the note's repository really
-- has: that path, at that hash, under that version. Checked in a trigger
-- rather than a policy because a policy can't see the old row, and an edit
-- that keeps a stamp must still pass after the analysis it names was pruned.
-- Runs as the caller, so the analyses and files policies apply inside it.
create function private.check_note_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.written_version is null then
    raise exception 'A new note must record the file it was written against';
  end if;
  if tg_op = 'UPDATE'
     and new.written_version is not distinct from old.written_version
     and new.content_hash is not distinct from old.content_hash then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.written_version is null then
    raise exception 'A note''s stamp can be moved but not removed';
  end if;
  if not exists (
    select 1
    from public.analyses a
    join public.files f on f.analysis_id = a.id
    where a.project_id = new.project_id
      and a.version = new.written_version
      and f.path = new.path
      and f.content_hash = new.content_hash
  ) then
    raise exception 'No stored analysis of this repository has % at that content under version %', new.path, new.written_version;
  end if;
  return new;
end
$$;

create trigger notes_check_stamp
  before insert or update on public.notes
  for each row execute function private.check_note_stamp();

grant insert (written_version, content_hash) on public.notes to authenticated;
grant update (written_version, content_hash) on public.notes to authenticated;
