-- Branches inside one repository.

-- ─── The default branch ────────────────────────────────────────────────────
-- Copied from GitHub whenever a run fetches the repository, beside the
-- description, and overwritten each time, so a changed default is followed by
-- the next run. Null until a run after this phase records it; nothing is
-- guessed for repositories mapped before.

alter table public.projects add column default_branch text;

-- ─── A repository's default-branch analyses ────────────────────────────────
-- Embedded from projects as a computed relationship, so the list can ask for
-- each repository's newest default-branch analysis in the same request as the
-- rest. Which branch is the default lives on the project row, which an
-- embedded filter can't reach; this join is the only place that says it.
--
-- Security invoker: the analyses come back through their own policy, exactly
-- as a plain embed would. An analysis asked for by commit has no branch, so it
-- never matches, even when the commit is the default branch's tip.

create function public.default_branch_analyses(public.projects)
returns setof public.analyses
language sql
stable
security invoker
set search_path = ''
rows 10
as $$
  select a.* from public.analyses a
  where a.project_id = $1.id and a.branch = $1.default_branch
$$;

grant execute on function public.default_branch_analyses(public.projects) to authenticated;
