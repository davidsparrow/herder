alter table students
  add column first_name text not null default '',
  add column last_name text not null default '';

update students
set
  first_name = case
    when position(' ' in trim(name)) > 0 then coalesce(nullif(split_part(trim(name), ' ', 1), ''), '')
    else coalesce(trim(name), '')
  end,
  last_name = case
    when position(' ' in trim(name)) > 0 then coalesce(nullif(trim(substring(trim(name) from position(' ' in trim(name)) + 1)), ''), '')
    else ''
  end;

alter table checkin_lists
  add column source_metadata jsonb not null default '{}'::jsonb;