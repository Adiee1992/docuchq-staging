-- Add a readable, immutable account identifier while retaining the auth UUID as
-- the profile primary key. The sequence makes concurrent signups safe.
create sequence if not exists public.profile_account_number_seq
    as bigint
    start with 1000
    increment by 1
    no minvalue
    no maxvalue
    cache 1;

alter table public.profiles
    add column if not exists account_number text;

-- Give existing accounts stable numbers in account creation order. Start after
-- any identifiers that may already exist in a partially migrated environment.
with existing_maximum as (
    select greatest(
        999,
        coalesce(max(substring(account_number from '^DCU-([0-9]+)$')::bigint), 999)
    ) as value
    from public.profiles
    where account_number ~ '^DCU-[0-9]+$'
),
unnumbered as (
    select
        id,
        row_number() over (order by created_at, id) + existing_maximum.value as sequence_number
    from public.profiles
    cross join existing_maximum
    where account_number is null
)
update public.profiles as profile
set account_number = 'DCU-' || unnumbered.sequence_number::text
from unnumbered
where profile.id = unnumbered.id;

-- Continue after the largest number already assigned, including environments
-- where this migration is reapplied after some accounts have been numbered.
select setval(
    'public.profile_account_number_seq',
    greatest(
        999,
        coalesce((
            select max(substring(account_number from '^DCU-([0-9]+)$')::bigint)
            from public.profiles
            where account_number ~ '^DCU-[0-9]+$'
        ), 999)
    ),
    true
);

alter table public.profiles
    alter column account_number set default ('DCU-' || nextval('public.profile_account_number_seq')::text),
    alter column account_number set not null;

create unique index if not exists profiles_account_number_key
    on public.profiles (account_number);

grant usage, select on sequence public.profile_account_number_seq
    to authenticated, service_role;

comment on column public.profiles.account_number is
    'Public-facing immutable user identifier, assigned sequentially as DCU-1000, DCU-1001, and so on.';

notify pgrst, 'reload schema';
