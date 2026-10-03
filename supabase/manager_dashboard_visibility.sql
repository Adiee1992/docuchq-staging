create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
    select role
    from public.profiles
    where id = auth.uid()
    limit 1
$$;

create or replace function public.is_manager_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(public.current_user_role() in ('manager', 'admin'), false)
$$;

alter table public.documents enable row level security;
alter table public.clearance_tracks enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Managers can read all documents" on public.documents;
create policy "Managers can read all documents"
on public.documents
for select
to authenticated
using (public.is_manager_user());

drop policy if exists "Managers can read all clearance tracks" on public.clearance_tracks;
create policy "Managers can read all clearance tracks"
on public.clearance_tracks
for select
to authenticated
using (public.is_manager_user());

drop policy if exists "Managers can read all profiles" on public.profiles;
create policy "Managers can read all profiles"
on public.profiles
for select
to authenticated
using (public.is_manager_user());

notify pgrst, 'reload schema';
