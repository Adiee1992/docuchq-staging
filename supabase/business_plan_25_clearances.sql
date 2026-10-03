-- Converts Business from unlimited usage to 25 clearances per 30-day activation.
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
set track_limit = 25,
    status = case when tracks_used >= 25 and status = 'active' then 'exhausted' else status end,
    updated_at = now()
where plan_type = 'business';

alter table public.customer_plan_activations
add constraint customer_plan_activation_limits_check check (
    (plan_type = 'trial' and track_limit is not null)
    or (plan_type = 'standard' and track_limit = 10 and expires_at is not null)
    or (plan_type = 'business' and track_limit = 25 and expires_at is not null)
);

create or replace function public.normalize_business_plan_limit()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
    if new.plan_type = 'business' then
        new.track_limit := 25;
    end if;
    return new;
end;
$function$;

drop trigger if exists normalize_business_plan_limit on public.customer_plan_activations;
create trigger normalize_business_plan_limit
before insert or update of plan_type, track_limit on public.customer_plan_activations
for each row execute function public.normalize_business_plan_limit();

update public.profiles p
set available_clearances = greatest(25 - activation.tracks_used, 0)
from public.customer_plan_activations activation
where activation.profile_id = p.id
  and activation.plan_type = 'business'
  and activation.status in ('active', 'exhausted');

notify pgrst, 'reload schema';
