alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile simple" on public.profiles;
create policy "Users can read own profile simple"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert own profile simple" on public.profiles;
create policy "Users can insert own profile simple"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile simple" on public.profiles;
create policy "Users can update own profile simple"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

notify pgrst, 'reload schema';
