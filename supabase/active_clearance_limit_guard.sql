alter table public.clearance_tracks
add column if not exists clearance_deducted boolean not null default false;

create or replace function public.enforce_active_clearance_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    remaining_clearances integer := 0;
    active_track_count integer := 0;
begin
    select coalesce(available_clearances, 0)
    into remaining_clearances
    from public.profiles
    where id = new.profile_id
    for update;

    if remaining_clearances <= 0 then
        raise exception 'No available clearances left. Please purchase more credits to create another clearance.';
    end if;

    select count(*)
    into active_track_count
    from public.clearance_tracks
    where profile_id = new.profile_id
      and clearance_deducted = false;

    if active_track_count >= remaining_clearances then
        raise exception 'Active pending clearances have reached your available clearance limit. Please purchase more credits or wait for a current clearance to be processed.';
    end if;

    return new;
end;
$$;

drop trigger if exists enforce_active_clearance_limit on public.clearance_tracks;
create trigger enforce_active_clearance_limit
before insert on public.clearance_tracks
for each row
execute function public.enforce_active_clearance_limit();

notify pgrst, 'reload schema';
