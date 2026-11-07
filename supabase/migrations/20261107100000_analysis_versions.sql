-- Analyses are named "Version N" within their repository instead of by hash.
--
-- N is handed out once, when the row is created, and never changes. A
-- repository keeps only its newest analyses, so a number taken from position
-- in the list would point at a different map after the oldest was dropped.
-- The counter lives on the project rather than being max(version) + 1, so a
-- number is never reused, even if the newest row is ever removed.

alter table public.projects add column last_version integer not null default 0;
alter table public.analyses add column version integer;

-- Rows from before this get numbers in the order they were asked for.
with numbered as (
  select id, row_number() over (partition by project_id order by created_at, id) as n
  from public.analyses
)
update public.analyses a set version = numbered.n from numbered where numbered.id = a.id;

update public.projects p
set last_version = coalesce((select max(version) from public.analyses a where a.project_id = p.id), 0);

alter table public.analyses
  alter column version set not null,
  add constraint analyses_one_per_version unique (project_id, version);

-- The update takes the project's row lock, so two runs starting at once queue
-- for their numbers instead of taking the same one. If the insert then fails,
-- say on the one-per-commit constraint, the statement rolls back with it and
-- no number is spent.
create function public.assign_analysis_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.projects set last_version = last_version + 1
  where id = new.project_id
  returning last_version into new.version;
  if new.version is null then
    raise exception 'analysis % has no project to number it in', new.id;
  end if;
  return new;
end;
$$;

create trigger analyses_assign_version
  before insert on public.analyses
  for each row execute function public.assign_analysis_version();
