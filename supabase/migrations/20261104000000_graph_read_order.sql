-- Opening a map reads every row of an analysis, 1,000 at a time, ordered by id.
--
-- The indexes these tables had find an analysis's rows but not in id order, so
-- every page collected all of the analysis's rows, sorted them, and kept a
-- thousand. A large repository is dozens of pages, each one re-sorting the
-- whole table's share. With (analysis_id, id), a page is read off the index in
-- order and nothing is sorted.
--
-- file_roles has no analysis column (it is reached through files), so it gets
-- nothing here.

create index files_analysis_order_idx on public.files (analysis_id, id);
create index edges_analysis_order_idx on public.edges (analysis_id, id);
create index imports_analysis_order_idx on public.imports (analysis_id, id);
create index routes_analysis_order_idx on public.routes (analysis_id, id);
