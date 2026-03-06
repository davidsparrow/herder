-- ============================================================
-- Herder — Auto-create org + profile on new user signup
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
  email_domain text;
begin
  -- Derive a default org name from the email domain
  email_domain := split_part(new.email, '@', 2);
  if email_domain is null or email_domain = '' then
    email_domain := 'my-org';
  end if;

  -- Create the org
  insert into public.orgs (name, plan_tier)
  values (email_domain, 'free')
  returning id into new_org_id;

  -- Create the profile
  insert into public.profiles (id, email, full_name, role, org_id, plan_tier)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'admin',
    new_org_id,
    'free'
  );

  return new;
end;
$$;

-- Drop trigger if it already exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
