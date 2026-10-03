create table if not exists public.user_legal_acceptances (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete restrict,
    email_at_acceptance text not null,
    terms_version text not null,
    privacy_version text not null,
    terms_document_hash text not null,
    privacy_document_hash text not null,
    terms_accepted boolean not null check (terms_accepted),
    privacy_accepted boolean not null check (privacy_accepted),
    terms_acceptance_text text not null,
    privacy_acceptance_text text not null,
    signup_method text not null check (signup_method in ('password', 'google')),
    client_accepted_at timestamptz,
    accepted_at timestamptz not null default now(),
    ip_address text,
    user_agent text,
    request_headers jsonb not null default '{}'::jsonb,
    unique (user_id, terms_version, privacy_version)
);

alter table public.user_legal_acceptances
add column if not exists client_accepted_at timestamptz;

create index if not exists user_legal_acceptances_user_created_idx
on public.user_legal_acceptances(user_id, accepted_at desc);

alter table public.user_legal_acceptances enable row level security;

grant select on public.user_legal_acceptances to authenticated;

drop policy if exists "Users can read own legal acceptances" on public.user_legal_acceptances;
create policy "Users can read own legal acceptances"
on public.user_legal_acceptances
for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_manager_user()
);

drop function if exists public.record_current_legal_acceptance(text);

create or replace function public.record_current_legal_acceptance(
    signup_method_input text,
    client_accepted_at_input timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
    acceptance_id uuid;
    headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    source_ip text;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to record legal acceptance.';
    end if;

    if signup_method_input not in ('password', 'google') then
        raise exception 'Unsupported signup method.';
    end if;

    source_ip := coalesce(
        headers ->> 'cf-connecting-ip',
        split_part(headers ->> 'x-forwarded-for', ',', 1),
        headers ->> 'x-real-ip'
    );

    insert into public.user_legal_acceptances (
        user_id,
        email_at_acceptance,
        terms_version,
        privacy_version,
        terms_document_hash,
        privacy_document_hash,
        terms_accepted,
        privacy_accepted,
        terms_acceptance_text,
        privacy_acceptance_text,
        signup_method,
        client_accepted_at,
        ip_address,
        user_agent,
        request_headers
    )
    values (
        auth.uid(),
        coalesce(auth.jwt() ->> 'email', ''),
        '2026-06-18',
        '2026-06-18',
        '61ba5014b70cf8ac1609e854a76062432c2ef5802127ccf8f2668e3ebe125e78',
        '6a2ead40ba80dd48fbac94aef9515bbf6a445722fca8bf1e382e1429ea72cdc6',
        true,
        true,
        'I agree to the Terms of Use.',
        'I acknowledge the Privacy Notice and consent to the described processing of my personal data.',
        signup_method_input,
        client_accepted_at_input,
        nullif(trim(source_ip), ''),
        headers ->> 'user-agent',
        headers
    )
    on conflict (user_id, terms_version, privacy_version)
    do nothing
    returning id into acceptance_id;

    if acceptance_id is null then
        select id
        into acceptance_id
        from public.user_legal_acceptances
        where user_id = auth.uid()
          and terms_version = '2026-06-18'
          and privacy_version = '2026-06-18';
    end if;

    return acceptance_id;
end;
$function$;

revoke all on function public.record_current_legal_acceptance(text, timestamptz) from public;
grant execute on function public.record_current_legal_acceptance(text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
