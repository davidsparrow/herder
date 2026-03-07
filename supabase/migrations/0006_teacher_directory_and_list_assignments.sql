create table if not exists public.teachers (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.teachers enable row level security;

create policy "teacher_read" on public.teachers
  for select using (org_id = auth_org_id());

create policy "teacher_insert" on public.teachers
  for insert with check (auth_role() = 'admin' and org_id = auth_org_id());

create policy "teacher_update" on public.teachers
  for update using (auth_role() = 'admin' and org_id = auth_org_id());

create policy "teacher_delete" on public.teachers
  for delete using (auth_role() = 'admin' and org_id = auth_org_id());

alter table public.checkin_lists
  add column if not exists original_teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists substitute_teacher_id uuid references public.teachers(id) on delete set null;

create index if not exists idx_teachers_org on public.teachers(org_id);
create index if not exists idx_lists_original_teacher on public.checkin_lists(original_teacher_id);
create index if not exists idx_lists_substitute_teacher on public.checkin_lists(substitute_teacher_id);