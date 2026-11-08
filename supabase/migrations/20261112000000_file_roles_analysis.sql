-- Opening a map read file_roles through a join to files, because it had no
-- analysis column of its own. Ordered by id, that meant walking the table's
-- rows for every analysis kept to find one analysis's, and since a repository
-- now keeps ten, a large one went past the statement timeout. With the column
-- and (analysis_id, id), a page is read off the index in order, as the other
-- graph tables are, and its cost no longer grows with the versions kept.

alter table public.file_roles add column analysis_id uuid;

update public.file_roles r
set analysis_id = f.analysis_id
from public.files f
where f.id = r.file_id;

alter table public.file_roles
  alter column analysis_id set not null,
  add constraint file_roles_analysis_id_org_id_fkey
    foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade;

create index file_roles_analysis_order_idx on public.file_roles (analysis_id, id);
