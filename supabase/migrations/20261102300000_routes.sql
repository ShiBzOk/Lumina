-- Framework adapters extract routes.
--
-- A route carries the line its method is written on, so each one can be
-- checked by hand against the code it came from. No route has been written
-- before this phase, so the column needs no default.
alter table public.routes add column line integer not null;

-- Route definitions an adapter saw but could not state exactly, each with the
-- reason. Every analysis before this phase ran without an adapter, which
-- withholds nothing, so an empty list is the truth for those rows.
alter table public.analyses add column routes_withheld jsonb not null default '[]'::jsonb;
