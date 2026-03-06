alter table public.orgs
  add column if not exists phone text,
  add column if not exists email text;