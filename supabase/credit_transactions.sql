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

drop policy if exists "Users can read their own credit transactions" on public.credit_transactions;
create policy "Users can read their own credit transactions"
on public.credit_transactions
for select
to authenticated
using (auth.uid() = profile_id);
