-- Generate a consistent, system-owned identifier for every new clearance.
create sequence if not exists public.clearance_track_reference_seq;

do $function$
declare
    highest_existing bigint;
begin
    select max(substring(reference_id from '^DCHQ-([0-9]+)$')::bigint)
    into highest_existing
    from public.clearance_tracks
    where reference_id ~ '^DCHQ-[0-9]+$';

    perform setval(
        'public.clearance_track_reference_seq',
        greatest(coalesce(highest_existing, 0), 1),
        coalesce(highest_existing, 0) > 0
    );
end;
$function$;

create or replace function public.assign_clearance_track_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if new.reference_id is null or btrim(new.reference_id) = '' then
        new.reference_id := 'DCHQ-' || lpad(
            nextval('public.clearance_track_reference_seq')::text,
            6,
            '0'
        );
    end if;

    return new;
end;
$function$;

drop trigger if exists assign_clearance_track_reference on public.clearance_tracks;
create trigger assign_clearance_track_reference
before insert on public.clearance_tracks
for each row execute function public.assign_clearance_track_reference();

notify pgrst, 'reload schema';
