-- Keep new exporter provisioning aligned with the one-clearance trial and the
-- exporter_iec_registry constraint introduced for the 14-day trial.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    requested_role text := coalesce(new.raw_user_meta_data->>'role', 'exporter');
    normalized_iec text := upper(
        regexp_replace(
            coalesce(new.raw_user_meta_data->>'iec_code', ''),
            '[^A-Za-z0-9]',
            '',
            'g'
        )
    );
    registry_inserted text;
begin
    if requested_role = 'exporter' then
        if normalized_iec !~ '^[A-Z0-9]{10}$' then
            raise exception 'A valid 10-character IEC code is required.';
        end if;

        insert into public.exporter_iec_registry (
            iec_code,
            first_user_id,
            introductory_clearances_granted
        )
        values (
            normalized_iec,
            new.id,
            1
        )
        on conflict (iec_code) do nothing
        returning iec_code into registry_inserted;

        if registry_inserted is null then
            raise exception 'This IEC code has already been registered.';
        end if;
    else
        normalized_iec := null;
    end if;

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
        normalized_iec,
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

notify pgrst, 'reload schema';
