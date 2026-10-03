-- Changes the one-time exporter trial to 1 clearance valid for 14 days.
do $function$
declare
    constraint_record record;
begin
    for constraint_record in
        select conname
        from pg_constraint
        where conrelid = 'public.customer_plan_activations'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%plan_type%'
          and pg_get_constraintdef(oid) ilike '%track_limit%'
    loop
        execute format('alter table public.customer_plan_activations drop constraint %I', constraint_record.conname);
    end loop;
end;
$function$;

update public.customer_plan_activations
set track_limit = 1,
    expires_at = starts_at + interval '14 days',
    status = case
        when status in ('replaced', 'cancelled') then status
        when starts_at + interval '14 days' <= now() then 'expired'
        when tracks_used >= 1 then 'exhausted'
        else 'active'
    end,
    updated_at = now()
where plan_type = 'trial';

alter table public.customer_plan_activations
add constraint customer_plan_activation_limits_check check (
    (plan_type = 'trial' and track_limit = 1 and expires_at is not null)
    or (plan_type = 'standard' and track_limit = 10 and expires_at is not null)
    or (plan_type = 'business' and track_limit = 25 and expires_at is not null)
);

create or replace function public.provision_exporter_trial_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if new.role = 'exporter' then
        insert into public.customer_plan_activations(profile_id, plan_type, status, starts_at, expires_at, track_limit, tracks_used, payment_method, notes)
        values (new.id, 'trial', 'active', now(), now() + interval '14 days', 1, 0, 'complimentary', 'Automatically activated one-time 14-day exporter trial.')
        on conflict do nothing;
    end if;
    return new;
end;
$function$;

alter table public.profiles alter column available_clearances set default 1;
update public.profiles p
set available_clearances = case when activation.status = 'active' then greatest(1 - activation.tracks_used, 0) else 0 end
from public.customer_plan_activations activation
where activation.profile_id = p.id and activation.plan_type = 'trial';

do $function$
declare
    constraint_record record;
begin
    if to_regclass('public.exporter_iec_registry') is not null then
        for constraint_record in
            select conname from pg_constraint
            where conrelid = 'public.exporter_iec_registry'::regclass
              and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%introductory_clearances_granted%'
        loop
            execute format('alter table public.exporter_iec_registry drop constraint %I', constraint_record.conname);
        end loop;
        update public.exporter_iec_registry set introductory_clearances_granted = 1;
        alter table public.exporter_iec_registry alter column introductory_clearances_granted set default 1;
        alter table public.exporter_iec_registry add constraint exporter_iec_registry_trial_grant_check check (introductory_clearances_granted = 1);
    end if;
end;
$function$;

notify pgrst, 'reload schema';
