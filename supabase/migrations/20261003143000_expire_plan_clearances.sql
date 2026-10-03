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

-- Clean up plans that expired before this migration was installed.
select public.expire_customer_plans();

do $function$
declare
    existing_job_id bigint;
begin
    select jobid into existing_job_id
    from cron.job
    where jobname = 'expire-customer-plans'
    limit 1;

    if existing_job_id is not null then
        perform cron.unschedule(existing_job_id);
    end if;
end;
$function$;

select cron.schedule_in_database(
    'expire-customer-plans',
    '5 * * * *',
    'select public.expire_customer_plans();',
    'postgres',
    null,
    true
);

notify pgrst, 'reload schema';
