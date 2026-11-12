drop function if exists public.record_current_legal_acceptance(text, timestamptz);

create function public.record_current_legal_acceptance(
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
        user_id, email_at_acceptance, terms_version, privacy_version,
        terms_document_hash, privacy_document_hash, terms_accepted,
        privacy_accepted, terms_acceptance_text, privacy_acceptance_text,
        signup_method, client_accepted_at, ip_address, user_agent, request_headers
    )
    values (
        auth.uid(), coalesce(auth.jwt() ->> 'email', ''),
        '2026-11-01', '2026-11-01-v2',
        'f80f611c5a92b1c87756468b576726cfb0a1655030b03b06fbb067dfe07ea449',
        'bdf7b4b56f2221fa23638b959a293fdda810088d61151113e4109f76593154ec',
        true, true,
        'I agree to the Terms of Use.',
        'I acknowledge the Privacy Notice and consent to the described processing of my personal data.',
        signup_method_input, client_accepted_at_input,
        nullif(trim(source_ip), ''), headers ->> 'user-agent', headers
    )
    on conflict (user_id, terms_version, privacy_version)
    do nothing
    returning id into acceptance_id;

    if acceptance_id is null then
        select id into acceptance_id
        from public.user_legal_acceptances
        where user_id = auth.uid()
          and terms_version = '2026-11-01'
          and privacy_version = '2026-11-01-v2';
    end if;

    return acceptance_id;
end;
$function$;

revoke all on function public.record_current_legal_acceptance(text, timestamptz) from public;
grant execute on function public.record_current_legal_acceptance(text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
