alter table public.clearance_tracks enable row level security;

drop policy if exists "Managers can delete clearance tracks" on public.clearance_tracks;
create policy "Managers can delete clearance tracks"
on public.clearance_tracks
for delete
to authenticated
using (public.is_manager_user());

notify pgrst, 'reload schema';
