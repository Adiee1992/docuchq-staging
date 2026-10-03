alter table public.profiles add column if not exists deletion_requested_at timestamptz;
alter table public.profiles add column if not exists deletion_scheduled_for timestamptz;
alter table public.exporter_iec_registry add column if not exists retained_until timestamptz;

create or replace function public.request_own_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $function$
declare
    scheduled_at timestamptz := now() + interval '14 days';
    customer_iec text;
begin
    select iec_code into customer_iec from public.profiles where id = auth.uid();
    if not found then raise exception 'Account profile not found.'; end if;

    update public.profiles
    set deletion_requested_at = now(), deletion_scheduled_for = scheduled_at, updated_at = now()
    where id = auth.uid();

    if customer_iec is not null and customer_iec <> '' then
        update public.exporter_iec_registry
        set retained_until = greatest(coalesce(retained_until, now()), now() + interval '1 year')
        where iec_code = customer_iec;
    end if;
    return scheduled_at;
end;
$function$;

create or replace function public.restore_own_pending_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
    scheduled_at timestamptz;
begin
    select deletion_scheduled_for into scheduled_at from public.profiles where id = auth.uid();
    if scheduled_at is null then return false; end if;
    if scheduled_at <= now() then raise exception 'The account restoration period has ended.'; end if;
    update public.profiles set deletion_requested_at = null, deletion_scheduled_for = null, updated_at = now() where id = auth.uid();
    return true;
end;
$function$;

-- Schedule this function daily in Supabase Cron. It must remain server-side.
create or replace function public.finalize_expired_account_deletions()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
    deleted_count integer;
begin
    with expired as (
        select id from public.profiles where deletion_scheduled_for <= now()
    ), deleted as (
        delete from auth.users users using expired where users.id = expired.id returning users.id
    )
    select count(*) into deleted_count from deleted;
    return deleted_count;
end;
$function$;

revoke all on function public.request_own_account_deletion() from public;
revoke all on function public.restore_own_pending_account() from public;
revoke all on function public.finalize_expired_account_deletions() from public;
grant execute on function public.request_own_account_deletion() to authenticated;
grant execute on function public.restore_own_pending_account() to authenticated;
notify pgrst, 'reload schema';
