-- Separate authorization from customer-editable profile data while preserving
-- the existing admin workflow of changing profiles.role in Supabase Studio.

create table if not exists public.user_roles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('exporter', 'verifier', 'manager', 'admin', 'compliance_officer')),
    updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from public, anon, authenticated;

insert into public.user_roles(user_id, role, updated_at)
select
    profiles.id,
    case when profiles.role in ('exporter', 'verifier', 'manager', 'admin', 'compliance_officer') then profiles.role else 'exporter' end,
    now()
from public.profiles
join auth.users on auth.users.id = profiles.id
on conflict (user_id) do update
set role = excluded.role,
    updated_at = excluded.updated_at;

create or replace function public.sync_profile_authorization_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if new.role not in ('exporter', 'verifier', 'manager', 'admin', 'compliance_officer') then
        raise exception 'Unsupported application role.';
    end if;

    insert into public.user_roles(user_id, role, updated_at)
    values (new.id, new.role, now())
    on conflict (user_id) do update
    set role = excluded.role,
        updated_at = excluded.updated_at;

    return new;
end;
$function$;

revoke all on function public.sync_profile_authorization_role() from public;

drop trigger if exists sync_profile_authorization_role on public.profiles;
create trigger sync_profile_authorization_role
after insert or update of role on public.profiles
for each row execute function public.sync_profile_authorization_role();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $function$
    select role
    from public.user_roles
    where user_id = auth.uid()
    limit 1
$function$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

-- All public signups are exporters. Internal access is granted only later by
-- an administrator changing profiles.role, which the trigger above mirrors.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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
        'exporter',
        1
    );

    return new;
end;
$function$;

alter table public.profiles alter column role set default 'exporter';

-- RLS selects the permitted row. Column privileges determine which fields a
-- signed-in user may write inside that row.
revoke insert, update on table public.profiles from authenticated;

grant insert (
    id,
    email,
    first_name,
    last_name,
    company_name,
    mobile_number,
    address,
    gstin,
    pan
) on public.profiles to authenticated;

grant update (
    email,
    first_name,
    last_name,
    company_name,
    mobile_number,
    address,
    gstin,
    pan,
    updated_at
) on public.profiles to authenticated;

comment on table public.user_roles is
'Protected application authorization roles. profiles.role is admin-editable display state mirrored here by trigger.';

notify pgrst, 'reload schema';
