-- Require() becomes an import kind.
--
-- The parser now resolves require() calls the same way it resolves imports, so
-- "require" joins the vocabulary an edge or an import may carry.

alter table public.edges
  drop constraint edges_kinds_check,
  add constraint edges_kinds_check
    check (cardinality(kinds) > 0 and kinds <@ array['import', 're-export', 'dynamic-import', 'require']);

alter table public.imports
  drop constraint imports_kind_check,
  add constraint imports_kind_check
    check (kind in ('import', 're-export', 'dynamic-import', 'require'));

-- Every analysis before this phase recorded no require imports: it counted the
-- calls under "deferred" and resolved none of them. So zero is the truth for
-- that bucket. The old "deferred" count is left in place, not erased.
update public.analyses
set coverage = jsonb_set(
  coverage,
  '{importsByKind,require}',
  '{"found": 0, "internal": 0, "external": 0, "excluded": 0, "unresolved": 0}'::jsonb
)
where coverage is not null
  and not (coverage -> 'importsByKind' ? 'require');
