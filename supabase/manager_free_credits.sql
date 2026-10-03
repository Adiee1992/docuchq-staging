create table if not exists public.credit_transactions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    transaction_type text not null check (transaction_type in ('purchase', 'usage', 'adjustment')),
    credits integer not null,
    amount numeric(12, 2),
    currency text not null default 'INR',
    description text,
    status text not null default 'completed',
    created_at timestamptz not null default now()
);

create index if not exists credit_transactions_profile_created_idx
on public.credit_transactions(profile_id, created_at desc);

alter table public.credit_transactions enable row level security;

grant select on public.credit_transactions to authenticated;

drop policy if exists "Users can read their own credit transactions" on public.credit_transactions;
create policy "Users can read their own credit transactions"
on public.credit_transactions
for select
to authenticated
using (
    auth.uid() = profile_id
    or public.is_manager_user()
);

create table if not exists public.free_credit_grants (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    granted_by uuid not null references public.profiles(id) on delete restrict,
    credits integer not null check (credits between 1 and 5),
    created_at timestamptz not null default now()
);

create index if not exists free_credit_grants_profile_created_idx
on public.free_credit_grants(profile_id, created_at desc);

alter table public.free_credit_grants enable row level security;

grant select on public.free_credit_grants to authenticated;

drop policy if exists "Managers can read free credit grants" on public.free_credit_grants;
create policy "Managers can read free credit grants"
on public.free_credit_grants
for select
to authenticated
using (public.is_manager_user());

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references public.profiles(id) on delete set null,
    entity_type text not null,
    entity_id uuid,
    action text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

grant select on public.audit_logs to authenticated;

drop policy if exists "Managers can read audit logs" on public.audit_logs;
create policy "Managers can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_manager_user());

create or replace function public.grant_manager_free_credits(
    customer_id_input uuid,
    credits_input integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_profile public.profiles%rowtype;
    month_start timestamptz := date_trunc('month', now());
    next_month timestamptz := date_trunc('month', now()) + interval '1 month';
    already_granted integer;
    new_balance integer;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can add free credits.';
    end if;

    if credits_input is null or credits_input < 1 or credits_input > 5 then
        raise exception 'Free credits must be between 1 and 5.';
    end if;

    select *
    into target_profile
    from public.profiles
    where id = customer_id_input
      and role = 'exporter'
    for update;

    if target_profile.id is null then
        raise exception 'Customer profile was not found.';
    end if;

    select coalesce(sum(credits), 0)
    into already_granted
    from public.free_credit_grants
    where profile_id = customer_id_input
      and created_at >= month_start
      and created_at < next_month;

    if already_granted + credits_input > 5 then
        raise exception 'A maximum of 5 free credits can be added per customer per month.';
    end if;

    update public.profiles
    set available_clearances = coalesce(available_clearances, 0) + credits_input
    where id = customer_id_input
    returning available_clearances into new_balance;

    insert into public.free_credit_grants (profile_id, granted_by, credits)
    values (customer_id_input, auth.uid(), credits_input);

    insert into public.credit_transactions (
        profile_id,
        transaction_type,
        credits,
        amount,
        currency,
        description,
        status
    )
    values (
        customer_id_input,
        'adjustment',
        credits_input,
        0,
        'INR',
        'Freebies Credited',
        'completed'
    );

    insert into public.audit_logs (
        actor_id,
        entity_type,
        entity_id,
        action,
        metadata
    )
    values (
        auth.uid(),
        'profile',
        customer_id_input,
        'freebie',
        jsonb_build_object(
            'credits', credits_input,
            'monthly_total', already_granted + credits_input,
            'available_clearances', new_balance,
            'customer_email', target_profile.email
        )
    );

    return jsonb_build_object(
        'available_clearances', new_balance,
        'monthly_total', already_granted + credits_input,
        'monthly_remaining', 5 - already_granted - credits_input
    );
end;
$$;

revoke all on function public.grant_manager_free_credits(uuid, integer) from public;
grant execute on function public.grant_manager_free_credits(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
