-- A repository keeps its analyses.
--
-- Re-analysing adds a row beside the old ones instead of re-running the one
-- row a repository had. What may not repeat is the commit: the submit action
-- resolves the commit before inserting, so this constraint is what makes two
-- people submitting the same repository and commit at once produce one row.
-- Rows written before this phase that failed before resolving a commit have
-- none; nulls are distinct, so they don't collide.

alter table public.analyses
  drop constraint analyses_one_per_project,
  add constraint analyses_one_per_commit unique (project_id, commit_sha);

-- The switcher lists one repository's analyses, newest first.
create index analyses_project_created_idx on public.analyses (project_id, created_at desc);

-- ─── Explanations belong to one analysis ───────────────────────────────────
-- An explanation is written from a file's neighbours, and neighbours differ
-- between commits. Keyed on content alone, a file whose own text didn't change
-- would be served the explanation written for another commit's graph. Now each
-- one hangs off the analysis it was written in, and goes when that analysis is
-- removed.
--
-- Rows already cached don't say which analysis they came from, and their key
-- can't be attributed to one, so they are dropped rather than guessed at.
delete from public.explanations;

alter table public.explanations
  add column analysis_id uuid not null,
  add constraint explanations_analysis_id_org_id_fkey
    foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  drop constraint explanations_org_id_model_key_key,
  add constraint explanations_one_per_key unique (analysis_id, model, key);
