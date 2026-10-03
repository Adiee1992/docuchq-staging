create unique index if not exists clearance_transactions_plan_expiry_key
on public.clearance_transactions(plan_activation_id)
where transaction_type = 'manual_adjustment' and reason = 'Plan expired';

create or replace function public.expire_customer_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
    expiring record;
    remaining integer;
    reset_count integer := 0;
begin
    for expiring in
        select
            activation.*,
            profile.available_clearances,
            profile.first_name,
            profile.last_name,
            profile.company_name,
            profile.email
        from public.customer_plan_activations activation
        join public.profiles profile on profile.id = activation.profile_id
        where activation.status = 'active'
          and activation.expires_at is not null
          and activation.expires_at <= now()
        order by activation.expires_at, activation.id
        for update of activation
    loop
        update public.customer_plan_activations
        set status = 'expired', updated_at = now()
        where id = expiring.id;

        if not exists (
            select 1
            from public.customer_plan_activations active_plan
            where active_plan.profile_id = expiring.profile_id
              and active_plan.id <> expiring.id
              and active_plan.status = 'active'
              and active_plan.starts_at <= now()
              and (active_plan.expires_at is null or active_plan.expires_at > now())
        ) then
            remaining := greatest(coalesce(expiring.available_clearances, 0), 0);

            if remaining > 0 then
                insert into public.clearance_transactions (
                    profile_id, plan_activation_id, plan_type, transaction_type,
                    amount, balance_before, balance_after, reason, actor_id,
                    customer_name_snapshot, company_name_snapshot, email_snapshot, created_at
                ) values (
                    expiring.profile_id, expiring.id, expiring.plan_type, 'manual_adjustment',
                    -remaining, remaining, 0, 'Plan expired', null,
                    nullif(btrim(concat_ws(' ', expiring.first_name, expiring.last_name)), ''),
                    expiring.company_name, expiring.email, expiring.expires_at
                )
                on conflict (plan_activation_id)
                where transaction_type = 'manual_adjustment' and reason = 'Plan expired'
                do nothing;
            end if;

            update public.profiles
            set available_clearances = 0, updated_at = now()
            where id = expiring.profile_id;

            reset_count := reset_count + 1;
        end if;
    end loop;

    return reset_count;
end;
$function$;

-- Add reconstructable expiry entries for plans that expired before expiry
-- logging was introduced. The unused amount is derived from the plan ledger.
insert into public.clearance_transactions (
    profile_id, plan_activation_id, plan_type, transaction_type,
    amount, balance_before, balance_after, reason, actor_id,
    customer_name_snapshot, company_name_snapshot, email_snapshot, created_at
)
select
    activation.profile_id,
    activation.id,
    activation.plan_type,
    'manual_adjustment',
    -greatest(activation.track_limit - activation.tracks_used, 0),
    greatest(activation.track_limit - activation.tracks_used, 0),
    0,
    'Plan expired',
    null,
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    profile.company_name,
    profile.email,
    activation.expires_at
from public.customer_plan_activations activation
join public.profiles profile on profile.id = activation.profile_id
where activation.status = 'expired'
  and activation.expires_at is not null
  and activation.track_limit is not null
  and activation.track_limit > activation.tracks_used
on conflict (plan_activation_id)
where transaction_type = 'manual_adjustment' and reason = 'Plan expired'
do nothing;

revoke all on function public.expire_customer_plans() from public;
grant execute on function public.expire_customer_plans() to service_role;

notify pgrst, 'reload schema';
