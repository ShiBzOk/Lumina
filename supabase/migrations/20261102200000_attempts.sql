-- One writer per analysis.
--
-- A run that stopped reporting is presumed dead and may be re-run, but nothing
-- can stop the old process if it is in fact still going. So each run is an
-- attempt: re-running claims the next number, and the database refuses file
-- rows from any attempt but the current one. Edges, imports and roles hang off
-- files, so fencing files fences everything a run stores.

alter table public.analyses add column attempt integer not null default 0;

-- The default only covers rows that already exist; every new file says which
-- attempt wrote it.
alter table public.files add column attempt integer not null default 0;
alter table public.files alter column attempt drop default;

create function private.fence_file_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The share lock makes a claim wait for inserts already in flight, and any
  -- insert after the claim sees the new attempt and is refused.
  perform 1
  from public.analyses a
  where a.id = new.analysis_id and a.attempt = new.attempt
  for share;
  if not found then
    raise exception 'analysis % is no longer on attempt %', new.analysis_id, new.attempt;
  end if;
  return new;
end;
$$;

create trigger files_fence_attempt
  before insert on public.files
  for each row execute function private.fence_file_insert();
