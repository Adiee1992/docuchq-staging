-- Keep the application profile email aligned with Supabase Auth only after Auth
-- has completed its email verification workflow.
create or replace function public.manager_update_customer_profile(customer_id_input uuid, profile_input jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $function$
declare updated_profile public.profiles%rowtype;
begin
    if not public.is_manager_user() then raise exception 'Only managers can edit customer profiles.'; end if;
    update public.profiles set
        first_name = nullif(btrim(profile_input->>'first_name'), ''),
        last_name = nullif(btrim(profile_input->>'last_name'), ''),
        company_name = nullif(btrim(profile_input->>'company_name'), ''),
        mobile_number = nullif(btrim(profile_input->>'mobile_number'), ''),
        address = nullif(btrim(profile_input->>'address'), ''),
        gstin = upper(nullif(btrim(profile_input->>'gstin'), '')),
        pan = upper(nullif(btrim(profile_input->>'pan'), '')),
        iec_code = upper(nullif(btrim(profile_input->>'iec_code'), '')),
        updated_at = now()
    where id = customer_id_input and role = 'exporter'
    returning * into updated_profile;
    if updated_profile.id is null then raise exception 'Exporter account not found.'; end if;
    return updated_profile;
end;
$function$;

create or replace function public.sync_verified_auth_email_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if new.email is distinct from old.email and new.email_confirmed_at is not null then
        update public.profiles
        set email = lower(new.email), updated_at = now()
        where id = new.id;
    end if;
    return new;
end;
$function$;

drop trigger if exists sync_verified_auth_email_to_profile on auth.users;
create trigger sync_verified_auth_email_to_profile
after update of email on auth.users
for each row execute function public.sync_verified_auth_email_to_profile();
