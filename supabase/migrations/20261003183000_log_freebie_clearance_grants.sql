alter table public.clearance_transactions
    add column if not exists free_credit_grant_id uuid;

alter table public.clearance_transactions
    drop constraint if exists clearance_transactions_free_credit_grant_id_fkey;
alter table public.clearance_transactions
    add constraint clearance_transactions_free_credit_grant_id_fkey
    foreign key (free_credit_grant_id) references public.free_credit_grants(id) on delete set null;

create unique index if not exists clearance_transactions_freebie_grant_key
on public.clearance_transactions(free_credit_grant_id)
where free_credit_grant_id is not null;

create or replace function public.grant_manager_free_credits(
    customer_id_input uuid,
    credits_input integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_profile public.profiles%rowtype;
    active_plan public.customer_plan_activations%rowtype;
    grant_record public.free_credit_grants%rowtype;
    month_start timestamptz := date_trunc('month', now());
    next_month timestamptz := date_trunc('month', now()) + interval '1 month';
    already_granted integer;
    previous_balance integer;
    new_balance integer;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can add free credits.';
    end if;

    if credits_input is null or credits_input < 1 or credits_input > 5 then
        raise exception 'Free credits must be between 1 and 5.';
    end if;

    select * into target_profile
    from public.profiles
    where id = customer_id_input and role = 'exporter'
    for update;

    if target_profile.id is null then
        raise exception 'Customer profile was not found.';
    end if;

    select coalesce(sum(credits), 0) into already_granted
    from public.free_credit_grants
    where profile_id = customer_id_input
      and created_at >= month_start
      and created_at < next_month;

    if already_granted + credits_input > 5 then
        raise exception 'A maximum of 5 free credits can be added per customer per month.';
    end if;

    select * into active_plan
    from public.customer_plan_activations
    where profile_id = customer_id_input
      and status = 'active'
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    previous_balance := coalesce(target_profile.available_clearances, 0);

    update public.profiles
    set available_clearances = previous_balance + credits_input,
        updated_at = now()
    where id = customer_id_input
    returning available_clearances into new_balance;

    insert into public.free_credit_grants (profile_id, granted_by, credits)
    values (customer_id_input, auth.uid(), credits_input)
    returning * into grant_record;

    insert into public.clearance_transactions (
        profile_id, free_credit_grant_id, plan_activation_id, plan_type,
        transaction_type, amount, balance_before, balance_after, reason,
        actor_id, customer_name_snapshot, company_name_snapshot, email_snapshot, created_at
    ) values (
        customer_id_input, grant_record.id, active_plan.id, active_plan.plan_type,
        'manual_adjustment', credits_input, previous_balance, new_balance, 'Freebies credited',
        auth.uid(), nullif(btrim(concat_ws(' ', target_profile.first_name, target_profile.last_name)), ''),
        target_profile.company_name, target_profile.email, grant_record.created_at
    );

    insert into public.credit_transactions (
        profile_id, transaction_type, credits, amount, currency, description, status
    ) values (
        customer_id_input, 'adjustment', credits_input, 0, 'INR',
        'Freebie credits added by manager', 'completed'
    );

    insert into public.audit_logs (actor_id, entity_type, entity_id, action, metadata)
    values (
        auth.uid(), 'profile', customer_id_input, 'freebie',
        jsonb_build_object(
            'credits', credits_input,
            'monthly_total', already_granted + credits_input,
            'available_clearances', new_balance,
            'customer_email', target_profile.email,
            'free_credit_grant_id', grant_record.id
        )
    );

    return jsonb_build_object(
        'available_clearances', new_balance,
        'monthly_total', already_granted + credits_input,
        'monthly_remaining', 5 - already_granted - credits_input,
        'free_credit_grant_id', grant_record.id
    );
end;
$function$;

-- Historical grants did not preserve point-in-time balances, so those fields
-- remain null instead of presenting reconstructed values as authoritative.
insert into public.clearance_transactions (
    profile_id, free_credit_grant_id, plan_activation_id, plan_type,
    transaction_type, amount, balance_before, balance_after, reason,
    actor_id, customer_name_snapshot, company_name_snapshot, email_snapshot, created_at
)
select
    freebie.profile_id,
    freebie.id,
    matching_plan.id,
    matching_plan.plan_type,
    'manual_adjustment',
    freebie.credits,
    null,
    null,
    'Freebies credited (historical)',
    freebie.granted_by,
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    profile.company_name,
    profile.email,
    freebie.created_at
from public.free_credit_grants freebie
join public.profiles profile on profile.id = freebie.profile_id
left join lateral (
    select activation.id, activation.plan_type
    from public.customer_plan_activations activation
    where activation.profile_id = freebie.profile_id
      and activation.starts_at <= freebie.created_at
      and (activation.expires_at is null or activation.expires_at >= freebie.created_at)
    order by activation.starts_at desc
    limit 1
) matching_plan on true
on conflict (free_credit_grant_id) where free_credit_grant_id is not null do nothing;

revoke all on function public.grant_manager_free_credits(uuid, integer) from public;
grant execute on function public.grant_manager_free_credits(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
