create table if not exists public.customer_issues (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    full_name text not null,
    company_name text,
    email text not null,
    mobile_number text,
    comments text not null,
    status text not null default 'new',
    created_at timestamptz not null default now(),
    viewed_at timestamptz,
    constraint customer_issues_status_check check (status in ('new', 'viewed'))
);

create index if not exists customer_issues_created_at_idx
on public.customer_issues(created_at desc);

alter table public.customer_issues enable row level security;

grant insert on public.customer_issues to authenticated;
grant select, update on public.customer_issues to authenticated;

drop policy if exists "Exporters can report own issues" on public.customer_issues;
create policy "Exporters can report own issues"
on public.customer_issues
for insert
to authenticated
with check (
    profile_id = auth.uid()
    and status = 'new'
    and viewed_at is null
);

drop policy if exists "Managers can read customer issues" on public.customer_issues;
create policy "Managers can read customer issues"
on public.customer_issues
for select
to authenticated
using (public.is_manager_user());

drop policy if exists "Managers can mark customer issues viewed" on public.customer_issues;
create policy "Managers can mark customer issues viewed"
on public.customer_issues
for update
to authenticated
using (public.is_manager_user())
with check (public.is_manager_user());

do $$
begin
    alter publication supabase_realtime add table public.customer_issues;
exception
    when duplicate_object then null;
end
$$;

notify pgrst, 'reload schema';
