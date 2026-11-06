-- The pass after the model removes any sentence naming a file it wasn't shown
-- and couldn't be matched to one. The reader is told how many, and that has to
-- survive the cache: a hit returns the cleaned text, which no longer shows
-- what was taken out of it.
--
-- Rows cached before the pass existed are never read again (the cache key
-- changed with it), so the default of 0 describes no stale row.

alter table public.explanations
  add column removed_sentences integer not null default 0 check (removed_sentences >= 0);
