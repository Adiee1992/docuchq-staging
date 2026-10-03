create unique index if not exists clearance_transactions_plan_grant_key
on public.clearance_transactions(plan_activation_id)
where transaction_type = 'purchase' and reason = 'Plan activated';

create or replace function public.record_plan_clearance_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    customer public.profiles%rowtype;
    granted integer;
begin
    granted := greatest(coalesce(new.track_limit, 0), 0);

    if granted = 0 then
        return new;
    end if;

    select * into customer
    from public.profiles
    where id = new.profile_id;

    insert into public.clearance_transactions (
        profile_id, plan_activation_id, plan_type, transaction_type,
        amount, balance_before, balance_after, reason, actor_id,
        customer_name_snapshot, company_name_snapshot, email_snapshot, created_at
    ) values (
        new.profile_id, new.id, new.plan_type, 'purchase',
        granted, 0, granted, 'Plan activated', new.activated_by,
        nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), ''),
        customer.company_name, customer.email, coalesce(new.starts_at, new.created_at)
    )
    on conflict (plan_activation_id)
    where transaction_type = 'purchase' and reason = 'Plan activated'
    do nothing;

    return new;
end;
$function$;

drop trigger if exists record_plan_clearance_grant on public.customer_plan_activations;
create trigger record_plan_clearance_grant
after insert on public.customer_plan_activations
for each row execute function public.record_plan_clearance_grant();

-- Add grant entries for plans created before activation logging was introduced.
insert into public.clearance_transactions (
    profile_id, plan_activation_id, plan_type, transaction_type,
    amount, balance_before, balance_after, reason, actor_id,
    customer_name_snapshot, company_name_snapshot, email_snapshot, created_at
)
select
    activation.profile_id,
    activation.id,
    activation.plan_type,
    'purchase',
    activation.track_limit,
    0,
    activation.track_limit,
    'Plan activated',
    activation.activated_by,
    nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    profile.company_name,
    profile.email,
    coalesce(activation.starts_at, activation.created_at)
from public.customer_plan_activations activation
join public.profiles profile on profile.id = activation.profile_id
where activation.track_limit is not null
  and activation.track_limit > 0
on conflict (plan_activation_id)
where transaction_type = 'purchase' and reason = 'Plan activated'
do nothing;

revoke all on function public.record_plan_clearance_grant() from public;

notify pgrst, 'reload schema';
