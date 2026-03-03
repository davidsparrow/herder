-- ============================================================
-- Herder — Supabase Database Schema
-- Run in Supabase SQL Editor or via supabase db push
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type plan_tier      as enum ('free', 'standard', 'pro');
create type user_role      as enum ('admin', 'teacher');
create type checkin_type   as enum ('manual', 'qr', 'group');
create type attendance_status as enum ('present', 'absent');
create type notif_channel  as enum ('sms', 'email');
create type notif_status   as enum ('queued', 'sent', 'failed');
create type notif_type     as enum ('arrival', 'absent', 'emergency', 'sub_assigned', 'magic_link');

-- ── Orgs ──────────────────────────────────────────────────────────────────────
create table orgs (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  plan_tier       plan_tier not null default 'free',
  plan_overrides  jsonb,                 -- admin-controlled per-org overrides
  created_at      timestamptz not null default now()
);

-- ── Profiles (extends auth.users) ────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'teacher',
  org_id      uuid not null references orgs(id) on delete cascade,
  plan_tier   plan_tier not null default 'free',
  created_at  timestamptz not null default now()
);

-- ── Check-in Lists ────────────────────────────────────────────────────────────
create table checkin_lists (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references orgs(id) on delete cascade,
  name             text not null,
  created_by       uuid not null references profiles(id),
  source_image_url text,
  recurring_days   int[] not null default '{}',   -- 0=Sun, 1=Mon … 6=Sat
  recurring_time   time,
  custom_columns   jsonb not null default '[]',
  version          int not null default 1,
  parent_list_id   uuid references checkin_lists(id),
  archived         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ── Students ──────────────────────────────────────────────────────────────────
create table students (
  id           uuid primary key default uuid_generate_v4(),
  list_id      uuid not null references checkin_lists(id) on delete cascade,
  uid          text not null,          -- "HD001" style
  name         text not null,
  custom_data  jsonb not null default '{}',
  qr_code_url  text,
  created_at   timestamptz not null default now(),
  unique (list_id, uid)
);

-- ── Checkin Sessions ──────────────────────────────────────────────────────────
create table checkin_sessions (
  id                uuid primary key default uuid_generate_v4(),
  list_id           uuid not null references checkin_lists(id) on delete cascade,
  session_date      date not null default current_date,
  submitted_at      timestamptz,
  submitted_by      uuid references profiles(id),
  sub_teacher_name  text,
  created_at        timestamptz not null default now(),
  unique (list_id, session_date)
);

-- ── Attendance ────────────────────────────────────────────────────────────────
create table attendance (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references checkin_sessions(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  status        attendance_status,
  checkin_type  checkin_type not null default 'manual',
  checked_at    timestamptz,
  unique (session_id, student_id)
);

-- ── Notification Log ──────────────────────────────────────────────────────────
create table notification_log (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  session_id  uuid references checkin_sessions(id),
  type        notif_type not null,
  channel     notif_channel not null,
  recipient   text not null,          -- email or phone
  status      notif_status not null default 'queued',
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table orgs              enable row level security;
alter table profiles          enable row level security;
alter table checkin_lists     enable row level security;
alter table students          enable row level security;
alter table checkin_sessions  enable row level security;
alter table attendance        enable row level security;
alter table notification_log  enable row level security;

-- Helper: get the caller's org_id
create or replace function auth_org_id() returns uuid language sql stable as $$
  select org_id from profiles where id = auth.uid()
$$;

-- Helper: get the caller's role
create or replace function auth_role() returns user_role language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

-- ── Orgs: members can read their own org; admins can update ──────────────────
create policy "org_read"   on orgs for select using (id = auth_org_id());
create policy "org_update" on orgs for update using (auth_role() = 'admin' and id = auth_org_id());

-- ── Profiles: read own org; admin can update any in org ──────────────────────
create policy "profile_read"   on profiles for select using (org_id = auth_org_id());
create policy "profile_insert" on profiles for insert with check (id = auth.uid());
create policy "profile_update" on profiles for update using (
  id = auth.uid() or auth_role() = 'admin'
);

-- ── Lists: org-scoped; teachers can create, admin can do everything ───────────
create policy "list_read"   on checkin_lists for select using (org_id = auth_org_id());
create policy "list_insert" on checkin_lists for insert with check (org_id = auth_org_id());
create policy "list_update" on checkin_lists for update using (org_id = auth_org_id());
create policy "list_delete" on checkin_lists for delete using (auth_role() = 'admin' and org_id = auth_org_id());

-- ── Students: via their list's org ───────────────────────────────────────────
create policy "student_read"   on students for select using (
  list_id in (select id from checkin_lists where org_id = auth_org_id())
);
create policy "student_insert" on students for insert with check (
  list_id in (select id from checkin_lists where org_id = auth_org_id())
);
create policy "student_update" on students for update using (
  list_id in (select id from checkin_lists where org_id = auth_org_id())
);

-- ── Sessions & attendance: same org scope ────────────────────────────────────
create policy "session_read"   on checkin_sessions for select using (
  list_id in (select id from checkin_lists where org_id = auth_org_id())
);
create policy "session_insert" on checkin_sessions for insert with check (
  list_id in (select id from checkin_lists where org_id = auth_org_id())
);
create policy "session_update" on checkin_sessions for update using (
  list_id in (select id from checkin_lists where org_id = auth_org_id())
);

create policy "attendance_read"   on attendance for select using (
  session_id in (select cs.id from checkin_sessions cs join checkin_lists cl on cs.list_id = cl.id where cl.org_id = auth_org_id())
);
create policy "attendance_upsert" on attendance for insert with check (
  session_id in (select cs.id from checkin_sessions cs join checkin_lists cl on cs.list_id = cl.id where cl.org_id = auth_org_id())
);
create policy "attendance_update" on attendance for update using (
  session_id in (select cs.id from checkin_sessions cs join checkin_lists cl on cs.list_id = cl.id where cl.org_id = auth_org_id())
);

-- ── Notification log: admin read only ────────────────────────────────────────
create policy "notif_read"   on notification_log for select using (org_id = auth_org_id() and auth_role() = 'admin');
create policy "notif_insert" on notification_log for insert with check (org_id = auth_org_id());

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_profiles_org   on profiles(org_id);
create index idx_lists_org      on checkin_lists(org_id);
create index idx_students_list  on students(list_id);
create index idx_sessions_list  on checkin_sessions(list_id);
create index idx_attendance_ses on attendance(session_id);
create index idx_notif_org      on notification_log(org_id);

-- ============================================================
-- TRIGGER: auto-create profile on first sign-in
-- (Backup to the /auth/callback route handler)
-- ============================================================
-- NOTE: The primary profile creation happens in /auth/callback.
-- This trigger handles edge cases (e.g. direct API calls).
