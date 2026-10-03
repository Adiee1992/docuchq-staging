create or replace function public.manager_request_customer_account_deletion(customer_id_input uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $function$
declare
    scheduled_at timestamptz := now() + interval '14 days';
    customer_iec text;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can schedule customer account deletion.';
    end if;

    select iec_code into customer_iec
    from public.profiles
    where id = customer_id_input and role = 'exporter';
    if not found then raise exception 'Exporter account not found.'; end if;

    update public.profiles
    set deletion_requested_at = now(), deletion_scheduled_for = scheduled_at, updated_at = now()
    where id = customer_id_input;

    if customer_iec is not null and customer_iec <> '' then
        update public.exporter_iec_registry
        set retained_until = greatest(coalesce(retained_until, now()), now() + interval '1 year')
        where iec_code = customer_iec;
    end if;

    return scheduled_at;
end;
$function$;

revoke all on function public.manager_request_customer_account_deletion(uuid) from public;
grant execute on function public.manager_request_customer_account_deletion(uuid) to authenticated;
