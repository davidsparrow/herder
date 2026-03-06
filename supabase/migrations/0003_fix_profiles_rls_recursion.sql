-- Fix recursive profiles RLS evaluation by avoiding helper-function lookups
-- from the profiles table's own select/update policies.

drop policy if exists "profile_read" on public.profiles;
drop policy if exists "profile_update" on public.profiles;

create policy "profile_read"
on public.profiles
for select
using (id = auth.uid());

create policy "profile_update"
on public.profiles
for update
using (
  id = auth.uid()
  or (org_id = auth_org_id() and auth_role() = 'admin')
);