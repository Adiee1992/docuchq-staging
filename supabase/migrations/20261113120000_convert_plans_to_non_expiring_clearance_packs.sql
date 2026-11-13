-- Treat purchases as non-expiring clearance packs. New exporters still receive
-- one complimentary clearance, but neither free nor paid clearances expire by date.

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
set expires_at = null,
    updated_at = now();

with latest_expired_with_balance as (
    select distinct on (profile_id)
        id,
        profile_id,
        greatest(coalesce(track_limit, 0) - coalesce(tracks_used, 0), 0) as remaining
    from public.customer_plan_activations
    where status = 'expired'
      and coalesce(track_limit, 0) > coalesce(tracks_used, 0)
    order by profile_id, created_at desc, id desc
), restored as (
    update public.customer_plan_activations activation
    set status = 'active', updated_at = now()
    from latest_expired_with_balance latest
    where activation.id = latest.id
    returning activation.profile_id, latest.remaining
)
update public.profiles profile
set available_clearances = greatest(profile.available_clearances, restored.remaining),
    updated_at = now()
from restored
where profile.id = restored.profile_id;

create or replace function public.provision_exporter_trial_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if new.role = 'exporter' then
        insert into public.customer_plan_activations(
            profile_id, plan_type, status, starts_at, expires_at,
            track_limit, tracks_used, payment_method, notes
        )
        values (
            new.id, 'trial', 'active', now(), null,
            1, 0, 'complimentary', 'Automatically granted one complimentary clearance.'
        )
        on conflict do nothing;
    end if;
    return new;
end;
$function$;

create or replace function public.activate_customer_plan(
    customer_id_input uuid,
    plan_type_input text,
    amount_input numeric,
    payment_reference_input text,
    payment_date_input date,
    payment_method_input text default 'bank_transfer',
    notes_input text default null
)
returns public.customer_plan_activations
language plpgsql
security definer
set search_path = public
as $function$
declare
    customer_profile public.profiles%rowtype;
    activation public.customer_plan_activations%rowtype;
    normalized_reference text := upper(trim(coalesce(payment_reference_input, '')));
    granted_clearances integer := case when plan_type_input = 'standard' then 1 else 10 end;
    purchase_name text := case when plan_type_input = 'standard' then 'Single Clearance' else 'Business' end;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can activate customer clearance packs.';
    end if;
    if plan_type_input not in ('standard', 'business') then
        raise exception 'Clearance pack must be Single Clearance or Business.';
    end if;
    if amount_input is null or amount_input < 0 then
        raise exception 'Enter a valid payment amount.';
    end if;
    if normalized_reference = '' then
        raise exception 'Payment reference is required.';
    end if;
    if payment_date_input is null then
        raise exception 'Payment date is required.';
    end if;

    select * into customer_profile
    from public.profiles
    where id = customer_id_input and role = 'exporter';

    if customer_profile.id is null then
        raise exception 'Exporter account not found.';
    end if;

    update public.customer_plan_activations
    set status = 'replaced', updated_at = now()
    where profile_id = customer_id_input and status = 'active';

    insert into public.customer_plan_activations(
        profile_id, plan_type, status, starts_at, expires_at, track_limit,
        tracks_used, amount, currency, payment_method, payment_reference,
        payment_date, notes, activated_by
    )
    values (
        customer_id_input, plan_type_input, 'active', now(), null,
        granted_clearances, 0, amount_input, 'INR',
        nullif(trim(payment_method_input), ''), normalized_reference,
        payment_date_input, nullif(trim(notes_input), ''), auth.uid()
    )
    returning * into activation;

    update public.profiles
    set available_clearances = granted_clearances, updated_at = now()
    where id = customer_id_input;

    insert into public.credit_transactions(
        profile_id, transaction_type, credits, amount, currency, description, status
    )
    values (
        customer_id_input, 'purchase', granted_clearances, amount_input,
        'INR', purchase_name || ' Purchased', 'completed'
    );

    insert into public.audit_logs(actor_id, entity_type, entity_id, action, metadata)
    values (
        auth.uid(), 'plan_activation', activation.id, 'manual_plan_activation',
        jsonb_build_object(
            'customer_id', customer_id_input,
            'customer_email', customer_profile.email,
            'plan_type', plan_type_input,
            'amount', amount_input,
            'payment_reference', normalized_reference,
            'payment_date', payment_date_input,
            'starts_at', activation.starts_at,
            'expires_at', null
        )
    );

    return activation;
exception
    when unique_violation then
        raise exception 'This payment reference has already been used.';
end;
$function$;

create or replace function public.expire_customer_plans()
returns integer
language sql
security definer
set search_path = public
as $function$
    select 0;
$function$;

create or replace function public.enforce_customer_plan_for_new_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    activation public.customer_plan_activations%rowtype;
begin
    select * into activation
    from public.customer_plan_activations
    where profile_id = new.profile_id
      and status = 'active'
      and starts_at <= now()
    order by created_at desc
    limit 1
    for update;

    if activation.id is null then
        raise exception 'No clearances are available. Purchase a clearance to create another one.';
    end if;

    if activation.track_limit is not null and activation.tracks_used >= activation.track_limit then
        update public.customer_plan_activations
        set status = 'exhausted', updated_at = now()
        where id = activation.id;
        raise exception 'No clearances are available. Purchase a clearance to create another one.';
    end if;

    update public.customer_plan_activations
    set tracks_used = tracks_used + 1,
        status = case
            when track_limit is not null and tracks_used + 1 >= track_limit then 'exhausted'
            else status
        end,
        updated_at = now()
    where id = activation.id;

    new.plan_activation_id := activation.id;
    return new;
end;
$function$;

revoke all on function public.activate_customer_plan(uuid, text, numeric, text, date, text, text) from public;
grant execute on function public.activate_customer_plan(uuid, text, numeric, text, date, text, text) to authenticated;
revoke all on function public.expire_customer_plans() from public;
grant execute on function public.expire_customer_plans() to service_role;

notify pgrst, 'reload schema';
