create table if not exists public.sales_leads (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    company_name text not null,
    email text not null,
    mobile_number text not null,
    comments text,
    status text not null default 'new',
    created_at timestamptz not null default now(),
    viewed_at timestamptz,
    constraint sales_leads_status_check check (status in ('new', 'viewed'))
);

create index if not exists sales_leads_created_at_idx
on public.sales_leads(created_at desc);

alter table public.sales_leads enable row level security;

grant insert on public.sales_leads to anon, authenticated;
grant select, update on public.sales_leads to authenticated;

drop policy if exists "Visitors can submit sales inquiries" on public.sales_leads;
create policy "Visitors can submit sales inquiries"
on public.sales_leads
for insert
to anon, authenticated
with check (
    status = 'new'
    and viewed_at is null
);

drop policy if exists "Managers can read sales inquiries" on public.sales_leads;
create policy "Managers can read sales inquiries"
on public.sales_leads
for select
to authenticated
using (public.is_manager_user());

drop policy if exists "Managers can mark sales inquiries viewed" on public.sales_leads;
create policy "Managers can mark sales inquiries viewed"
on public.sales_leads
for update
to authenticated
using (public.is_manager_user())
with check (public.is_manager_user());

do $$
begin
    alter publication supabase_realtime add table public.sales_leads;
exception
    when duplicate_object then null;
end
$$;

notify pgrst, 'reload schema';
