-- Manual subscription activation for Trial, Standard, and Business plans.
-- Run this migration after the existing profiles, clearance_tracks,
-- credit_transactions, and manager workflow migrations.

alter table public.clearance_tracks
add column if not exists plan_activation_id uuid;

create table if not exists public.customer_plan_activations (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null,
    plan_type text not null check (plan_type in ('trial', 'standard', 'business')),
    status text not null default 'active' check (status in ('active', 'expired', 'exhausted', 'replaced', 'cancelled')),
    starts_at timestamptz not null default now(),
    expires_at timestamptz,
    track_limit integer check (track_limit is null or track_limit >= 0),
    tracks_used integer not null default 0 check (tracks_used >= 0),
    amount numeric(12, 2),
    currency text not null default 'INR',
    payment_method text,
    payment_reference text,
    payment_date date,
    notes text,
    activated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (plan_type = 'trial' and track_limit = 1 and expires_at is not null)
        or (plan_type = 'standard' and track_limit = 10 and expires_at is not null)
        or (plan_type = 'business' and track_limit = 25 and expires_at is not null)
    )
);

create unique index if not exists customer_plan_payment_reference_key
on public.customer_plan_activations(upper(payment_reference))
where payment_reference is not null and trim(payment_reference) <> '';

create index if not exists customer_plan_profile_created_idx
on public.customer_plan_activations(profile_id, created_at desc);

create unique index if not exists customer_plan_one_active_idx
on public.customer_plan_activations(profile_id)
where status = 'active';

alter table public.customer_plan_activations enable row level security;

grant select on public.customer_plan_activations to authenticated;

drop policy if exists "Customers and managers can read plan activations" on public.customer_plan_activations;
create policy "Customers and managers can read plan activations"
on public.customer_plan_activations
for select
to authenticated
using (profile_id = auth.uid() or public.is_manager_user());

create or replace function public.touch_customer_plan_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

drop trigger if exists touch_customer_plan_updated_at on public.customer_plan_activations;
create trigger touch_customer_plan_updated_at
before update on public.customer_plan_activations
for each row execute function public.touch_customer_plan_updated_at();

-- Existing exporters keep only the unreserved trial capacity they had before
-- this migration. Existing tracks remain visible and are not counted again.
insert into public.customer_plan_activations (
    profile_id,
    plan_type,
    status,
    starts_at,
    expires_at,
    track_limit,
    tracks_used,
    payment_method,
    notes
)
select
    p.id,
    'trial',
    case
        when p.created_at + interval '14 days' <= now() then 'expired'
        when greatest(1 - coalesce(active_tracks.count, 0), 0) > 0 then 'active'
        else 'exhausted'
    end,
    p.created_at,
    p.created_at + interval '14 days',
    1,
    0,
    'complimentary',
    'Trial entitlement migrated from the existing clearance balance.'
from public.profiles p
left join (
    select profile_id, count(*)::integer as count
    from public.clearance_tracks
    where coalesce(clearance_deducted, false) = false
    group by profile_id
) active_tracks on active_tracks.profile_id = p.id
where p.role = 'exporter'
  and not exists (
      select 1
      from public.customer_plan_activations existing
      where existing.profile_id = p.id
  );

create or replace function public.provision_exporter_trial_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if new.role = 'exporter' then
        insert into public.customer_plan_activations (
            profile_id,
            plan_type,
            status,
            starts_at,
            expires_at,
            track_limit,
            tracks_used,
            payment_method,
            notes
        )
        values (
            new.id,
            'trial',
            'active',
            now(),
            now() + interval '14 days',
            1,
            0,
            'complimentary',
            'Automatically activated one-time exporter trial.'
        )
        on conflict do nothing;
    end if;

    return new;
end;
$function$;

drop trigger if exists provision_exporter_trial_plan on public.profiles;
create trigger provision_exporter_trial_plan
after insert on public.profiles
for each row execute function public.provision_exporter_trial_plan();

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
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can activate customer plans.';
    end if;

    if plan_type_input not in ('standard', 'business') then
        raise exception 'Plan must be Standard or Business.';
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

    select *
    into customer_profile
    from public.profiles
    where id = customer_id_input
      and role = 'exporter';

    if customer_profile.id is null then
        raise exception 'Exporter account not found.';
    end if;

    update public.customer_plan_activations
    set status = 'replaced', updated_at = now()
    where profile_id = customer_id_input
      and status = 'active';

    insert into public.customer_plan_activations (
        profile_id,
        plan_type,
        status,
        starts_at,
        expires_at,
        track_limit,
        tracks_used,
        amount,
        currency,
        payment_method,
        payment_reference,
        payment_date,
        notes,
        activated_by
    )
    values (
        customer_id_input,
        plan_type_input,
        'active',
        now(),
        now() + interval '30 days',
        case when plan_type_input = 'standard' then 10 else 25 end,
        0,
        amount_input,
        'INR',
        nullif(trim(payment_method_input), ''),
        normalized_reference,
        payment_date_input,
        nullif(trim(notes_input), ''),
        auth.uid()
    )
    returning * into activation;

    update public.profiles
    set available_clearances = case when plan_type_input = 'standard' then 10 else 25 end,
        updated_at = now()
    where id = customer_id_input;

    insert into public.credit_transactions (
        profile_id,
        transaction_type,
        credits,
        amount,
        currency,
        description,
        status
    )
    values (
        customer_id_input,
        'purchase',
        case when plan_type_input = 'standard' then 10 else 0 end,
        amount_input,
        'INR',
        initcap(plan_type_input) || ' Plan Activated',
        'completed'
    );

    insert into public.audit_logs (
        actor_id,
        entity_type,
        entity_id,
        action,
        metadata
    )
    values (
        auth.uid(),
        'plan_activation',
        activation.id,
        'manual_plan_activation',
        jsonb_build_object(
            'customer_id', customer_id_input,
            'customer_email', customer_profile.email,
            'plan_type', plan_type_input,
            'amount', amount_input,
            'payment_reference', normalized_reference,
            'payment_date', payment_date_input,
            'starts_at', activation.starts_at,
            'expires_at', activation.expires_at
        )
    );

    return activation;
exception
    when unique_violation then
        raise exception 'This payment reference has already been used.';
end;
$function$;

revoke all on function public.activate_customer_plan(uuid, text, numeric, text, date, text, text) from public;
grant execute on function public.activate_customer_plan(uuid, text, numeric, text, date, text, text) to authenticated;

create or replace function public.grant_manager_plan_credits(customer_id_input uuid, credits_input integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    result jsonb;
    activation public.customer_plan_activations%rowtype;
begin
    result := public.grant_manager_free_credits(customer_id_input, credits_input);

    select * into activation
    from public.customer_plan_activations
    where profile_id = customer_id_input
      and plan_type in ('trial', 'standard')
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1
    for update;

    if activation.id is not null then
        update public.customer_plan_activations
        set track_limit = track_limit + credits_input,
            status = 'active',
            updated_at = now()
        where id = activation.id;
    end if;

    return result || jsonb_build_object('plan_activation_id', activation.id);
end;
$function$;

revoke all on function public.grant_manager_plan_credits(uuid, integer) from public;
grant execute on function public.grant_manager_plan_credits(uuid, integer) to authenticated;

create or replace function public.expire_customer_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
    expired_count integer;
begin
    with expired as (
        update public.customer_plan_activations
        set status = 'expired', updated_at = now()
        where status = 'active'
          and expires_at is not null
          and expires_at <= now()
        returning profile_id
    ), affected as (
        select distinct profile_id from expired
    ), reset_profiles as (
        update public.profiles profile
        set available_clearances = 0, updated_at = now()
        from affected
        where profile.id = affected.profile_id
          and not exists (
              select 1
              from public.customer_plan_activations active_plan
              where active_plan.profile_id = profile.id
                and active_plan.status = 'active'
                and active_plan.starts_at <= now()
                and (active_plan.expires_at is null or active_plan.expires_at > now())
          )
        returning profile.id
    )
    select count(*) into expired_count from reset_profiles;

    return expired_count;
end;
$function$;

revoke all on function public.expire_customer_plans() from public;
grant execute on function public.expire_customer_plans() to service_role;

create or replace function public.enforce_customer_plan_for_new_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    activation public.customer_plan_activations%rowtype;
begin
    update public.customer_plan_activations
    set status = 'expired', updated_at = now()
    where profile_id = new.profile_id
      and status = 'active'
      and expires_at is not null
      and expires_at <= now();

    select *
    into activation
    from public.customer_plan_activations
    where profile_id = new.profile_id
      and status = 'active'
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1
    for update;

    if activation.id is null then
        raise exception 'Your account is currently view-only. A manager must activate a plan before you can create a new clearance.';
    end if;

    if activation.track_limit is not null
       and activation.tracks_used >= activation.track_limit then
        update public.customer_plan_activations
        set status = 'exhausted', updated_at = now()
        where id = activation.id;

        raise exception 'Your current plan has reached its clearance limit. Please renew your plan to create another clearance.';
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

drop trigger if exists enforce_active_clearance_limit on public.clearance_tracks;
drop trigger if exists enforce_customer_plan_for_new_track on public.clearance_tracks;
create trigger enforce_customer_plan_for_new_track
before insert on public.clearance_tracks
for each row execute function public.enforce_customer_plan_for_new_track();

notify pgrst, 'reload schema';
