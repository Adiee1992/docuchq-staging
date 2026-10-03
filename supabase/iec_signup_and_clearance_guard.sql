-- Run this migration before deploying the IEC signup field.
-- The registry intentionally has no cascading foreign key to auth.users or
-- profiles, so an IEC remains claimed after an account is deleted.

alter table public.profiles
add column if not exists iec_code text;

alter table public.profiles
add column if not exists available_clearances integer not null default 1;

create table if not exists public.exporter_iec_registry (
    iec_code text primary key,
    first_user_id uuid not null,
    first_registered_at timestamptz not null default now(),
    introductory_clearances_granted integer not null default 1
        check (introductory_clearances_granted = 1),
    check (iec_code ~ '^[A-Z0-9]{10}$')
);

comment on table public.exporter_iec_registry is
'Permanent IEC redemption registry. Rows must survive deletion of the related auth user and profile.';

alter table public.exporter_iec_registry enable row level security;

revoke all on table public.exporter_iec_registry from anon, authenticated;

create unique index if not exists profiles_iec_code_key
on public.profiles(iec_code)
where iec_code is not null and iec_code <> '';

create or replace function public.prevent_profile_iec_change()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
    registered_user_id uuid;
begin
    if tg_op = 'UPDATE'
       and old.iec_code is not null
       and old.iec_code <> ''
       and new.iec_code is distinct from old.iec_code then
        raise exception 'IEC code cannot be changed after registration.';
    end if;

    if new.iec_code is not null and new.iec_code <> '' then
        new.iec_code := upper(regexp_replace(new.iec_code, '[^A-Za-z0-9]', '', 'g'));

        if new.iec_code !~ '^[A-Z0-9]{10}$' then
            raise exception 'IEC code must contain exactly 10 letters or numbers.';
        end if;

        if tg_op = 'INSERT'
           or old.iec_code is null
           or old.iec_code = '' then
            select first_user_id
            into registered_user_id
            from public.exporter_iec_registry
            where iec_code = new.iec_code;

            if registered_user_id is not null and registered_user_id <> new.id then
                raise exception 'This IEC code has already been registered.';
            end if;

            insert into public.exporter_iec_registry (
                iec_code,
                first_user_id,
                introductory_clearances_granted
            )
            values (
                new.iec_code,
                new.id,
                1
            )
            on conflict (iec_code) do nothing;
        end if;
    end if;

    return new;
end;
$function$;

drop trigger if exists protect_profile_iec on public.profiles;
create trigger protect_profile_iec
before insert or update on public.profiles
for each row execute function public.prevent_profile_iec_change();

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
            2
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
        case when requested_role = 'exporter' then 2 else 0 end
    );

    return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

notify pgrst, 'reload schema';
