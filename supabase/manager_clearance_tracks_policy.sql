alter table public.clearance_tracks enable row level security;

drop policy if exists "Managers can read all clearance tracks" on public.clearance_tracks;
create policy "Managers can read all clearance tracks"
on public.clearance_tracks
for select
to authenticated
using (public.is_manager_user());

notify pgrst, 'reload schema';
