-- IEC is no longer collected during signup or exposed through profile editing.
-- Existing IEC values and historical redemption records remain intact.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    requested_role text := coalesce(new.raw_user_meta_data->>'role', 'exporter');
begin
    insert into public.profiles (
        id,
        email,
        first_name,
        last_name,
        company_name,
        iec_code,
        mobile_number,
        address,
        gstin,
        pan,
        role,
        available_clearances
    )
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'first_name', ''),
        coalesce(new.raw_user_meta_data->>'last_name', ''),
        coalesce(new.raw_user_meta_data->>'company_name', ''),
        null,
        coalesce(new.raw_user_meta_data->>'mobile_number', ''),
        coalesce(new.raw_user_meta_data->>'address', ''),
        coalesce(new.raw_user_meta_data->>'gstin', ''),
        coalesce(new.raw_user_meta_data->>'pan', ''),
        requested_role,
        case when requested_role = 'exporter' then 1 else 0 end
    );

    return new;
end;
$function$;

create or replace function public.manager_update_customer_profile(customer_id_input uuid, profile_input jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $function$
declare
    updated_profile public.profiles%rowtype;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can edit customer profiles.';
    end if;

    update public.profiles
    set first_name = nullif(btrim(profile_input->>'first_name'), ''),
        last_name = nullif(btrim(profile_input->>'last_name'), ''),
        company_name = nullif(btrim(profile_input->>'company_name'), ''),
        mobile_number = nullif(btrim(profile_input->>'mobile_number'), ''),
        address = nullif(btrim(profile_input->>'address'), ''),
        gstin = upper(nullif(btrim(profile_input->>'gstin'), '')),
        pan = upper(nullif(btrim(profile_input->>'pan'), '')),
        updated_at = now()
    where id = customer_id_input
      and role = 'exporter'
    returning * into updated_profile;

    if updated_profile.id is null then
        raise exception 'Exporter account not found.';
    end if;

    return updated_profile;
end;
$function$;

revoke all on function public.manager_update_customer_profile(uuid, jsonb) from public;
grant execute on function public.manager_update_customer_profile(uuid, jsonb) to authenticated;

comment on column public.profiles.iec_code is
'Legacy IEC value retained for existing accounts; no longer collected during signup or profile editing.';

notify pgrst, 'reload schema';
