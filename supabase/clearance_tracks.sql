create table if not exists public.clearance_tracks (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    reference_id text not null,
    customer_name text,
    destination_country text,
    invoice_currency text default 'INR',
    ad_bank_name text,
    payment_method text default 'LC',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (profile_id, reference_id)
);

alter table public.clearance_tracks enable row level security;

drop policy if exists "exporters can read own clearance tracks" on public.clearance_tracks;
create policy "exporters can read own clearance tracks"
on public.clearance_tracks
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "exporters can create own clearance tracks" on public.clearance_tracks;
create policy "exporters can create own clearance tracks"
on public.clearance_tracks
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "exporters can update own clearance tracks" on public.clearance_tracks;
create policy "exporters can update own clearance tracks"
on public.clearance_tracks
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create index if not exists idx_clearance_tracks_profile_id
on public.clearance_tracks(profile_id);

create or replace function public.touch_clearance_tracks_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists touch_clearance_tracks_updated_at on public.clearance_tracks;
create trigger touch_clearance_tracks_updated_at
before update on public.clearance_tracks
for each row
execute function public.touch_clearance_tracks_updated_at();

notify pgrst, 'reload schema';
