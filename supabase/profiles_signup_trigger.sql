create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    first_name text,
    last_name text,
    company_name text,
    iec_code text,
    mobile_number text,
    address text,
    gstin text,
    pan text,
    role text not null default 'exporter',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists id uuid;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists iec_code text;
alter table public.profiles add column if not exists mobile_number text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists gstin text;
alter table public.profiles add column if not exists pan text;
alter table public.profiles add column if not exists role text not null default 'exporter';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_id_key on public.profiles(id);
create unique index if not exists profiles_iec_code_key
on public.profiles(iec_code)
where iec_code is not null and iec_code <> '';

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
            role
        )
        values (
            new.id,
            new.email,
            coalesce(new.raw_user_meta_data->>'first_name', ''),
            coalesce(new.raw_user_meta_data->>'last_name', ''),
            coalesce(new.raw_user_meta_data->>'company_name', ''),
            nullif(upper(regexp_replace(coalesce(new.raw_user_meta_data->>'iec_code', ''), '[^A-Za-z0-9]', '', 'g')), ''),
            coalesce(new.raw_user_meta_data->>'mobile_number', ''),
            coalesce(new.raw_user_meta_data->>'address', ''),
            coalesce(new.raw_user_meta_data->>'gstin', ''),
            coalesce(new.raw_user_meta_data->>'pan', ''),
            coalesce(new.raw_user_meta_data->>'role', 'exporter')
        )
        on conflict (id) do update
        set
            email = excluded.email,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            company_name = excluded.company_name,
            iec_code = coalesce(public.profiles.iec_code, excluded.iec_code),
            mobile_number = excluded.mobile_number,
            address = excluded.address,
            gstin = excluded.gstin,
            pan = excluded.pan,
            role = excluded.role,
            updated_at = now();
    exception
        when others then
            raise warning 'Could not create profile for auth user %: %', new.id, sqlerrm;
    end;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
