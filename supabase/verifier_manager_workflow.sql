alter table public.documents
add column if not exists assigned_verifier_id uuid references public.profiles(id) on delete set null;

alter table public.documents
add column if not exists assigned_manager_id uuid references public.profiles(id) on delete set null;

alter table public.documents
add column if not exists assigned_at timestamptz;

alter table public.documents
add column if not exists escalated_to_manager boolean not null default false;

alter table public.documents
add column if not exists escalation_reason text;

alter table public.documents
add column if not exists escalated_at timestamptz;

alter table public.documents
add column if not exists deleted_at timestamptz;

alter table public.documents
add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.documents
add column if not exists deleted_reason text;

create index if not exists documents_assigned_verifier_id_idx
on public.documents(assigned_verifier_id);

create index if not exists documents_assigned_manager_id_idx
on public.documents(assigned_manager_id);

create index if not exists documents_escalated_to_manager_idx
on public.documents(escalated_to_manager);

create table if not exists public.document_assignments (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    assigned_from uuid references public.profiles(id) on delete set null,
    assigned_to uuid references public.profiles(id) on delete set null,
    assigned_by uuid references public.profiles(id) on delete set null,
    assignment_type text not null default 'manual',
    reason text,
    created_at timestamptz not null default now(),
    constraint document_assignments_type_check check (
        assignment_type in ('manual', 'escalation', 'takeover', 'auto')
    )
);

create table if not exists public.document_status_history (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    changed_by uuid references public.profiles(id) on delete set null,
    old_status text,
    new_status text not null,
    reason text,
    created_at timestamptz not null default now()
);

create index if not exists document_assignments_document_id_idx
on public.document_assignments(document_id);

create index if not exists document_status_history_document_id_idx
on public.document_status_history(document_id);

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
    select role
    from public.profiles
    where id = auth.uid()
    limit 1
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(public.current_user_role() in ('verifier', 'manager', 'admin'), false)
$$;

create or replace function public.is_manager_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(public.current_user_role() in ('manager', 'admin'), false)
$$;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (
    auth.uid() = id
    or public.is_manager_user()
    or (
        public.current_user_role() = 'verifier'
        and role = 'exporter'
    )
);

drop policy if exists "Exporters can read their own documents" on public.documents;
drop policy if exists "Exporters can insert their own documents" on public.documents;
drop policy if exists "Exporters can update their own documents" on public.documents;
drop policy if exists "Exporters can delete unlocked own documents" on public.documents;

create policy "Role based document read"
on public.documents
for select
to authenticated
using (
    profile_id = auth.uid()
    or assigned_verifier_id = auth.uid()
    or assigned_manager_id = auth.uid()
    or public.is_manager_user()
);

create policy "Exporters can insert their own documents"
on public.documents
for insert
to authenticated
with check (
    profile_id = auth.uid()
    and coalesce(public.current_user_role(), 'exporter') = 'exporter'
);

create policy "Exporters can update unlocked own documents"
on public.documents
for update
to authenticated
using (
    profile_id = auth.uid()
    and status not in ('needs_info', 'approved', 'clearance_issue')
)
with check (
    profile_id = auth.uid()
    and status not in ('needs_info', 'approved', 'clearance_issue')
);

create policy "Verifiers can update assigned documents"
on public.documents
for update
to authenticated
using (
    assigned_verifier_id = auth.uid()
    and public.current_user_role() = 'verifier'
)
with check (
    assigned_verifier_id = auth.uid()
    and public.current_user_role() = 'verifier'
);

create policy "Managers can update all documents"
on public.documents
for update
to authenticated
using (public.is_manager_user())
with check (public.is_manager_user());

create policy "Exporters can delete unlocked own documents"
on public.documents
for delete
to authenticated
using (
    profile_id = auth.uid()
    and status not in ('needs_info', 'approved', 'clearance_issue')
);

create policy "Managers can delete documents"
on public.documents
for delete
to authenticated
using (public.is_manager_user());

drop policy if exists "Users can read visible comments on own documents" on public.document_comments;
drop policy if exists "Users can comment on their own documents" on public.document_comments;

create policy "Role based comment read"
on public.document_comments
for select
to authenticated
using (
    exists (
        select 1
        from public.documents d
        where d.id = document_comments.document_id
        and (
            d.profile_id = auth.uid()
            or d.assigned_verifier_id = auth.uid()
            or d.assigned_manager_id = auth.uid()
            or public.is_manager_user()
        )
    )
    and (
        is_internal = false
        or public.is_internal_user()
    )
);

create policy "Role based comment insert"
on public.document_comments
for insert
to authenticated
with check (
    author_id = auth.uid()
    and exists (
        select 1
        from public.documents d
        where d.id = document_comments.document_id
        and (
            d.profile_id = auth.uid()
            or d.assigned_verifier_id = auth.uid()
            or d.assigned_manager_id = auth.uid()
            or public.is_manager_user()
        )
    )
    and (
        is_internal = false
        or public.is_internal_user()
    )
);

alter table public.document_assignments enable row level security;
alter table public.document_status_history enable row level security;

drop policy if exists "Role based assignment history read" on public.document_assignments;
create policy "Role based assignment history read"
on public.document_assignments
for select
to authenticated
using (
    public.is_internal_user()
    or exists (
        select 1
        from public.documents d
        where d.id = document_assignments.document_id
        and d.profile_id = auth.uid()
    )
);

drop policy if exists "Internal users can insert assignment history" on public.document_assignments;
create policy "Internal users can insert assignment history"
on public.document_assignments
for insert
to authenticated
with check (public.is_internal_user());

drop policy if exists "Role based status history read" on public.document_status_history;
create policy "Role based status history read"
on public.document_status_history
for select
to authenticated
using (
    public.is_internal_user()
    or exists (
        select 1
        from public.documents d
        where d.id = document_status_history.document_id
        and d.profile_id = auth.uid()
    )
);

drop policy if exists "Internal users can insert status history" on public.document_status_history;
create policy "Internal users can insert status history"
on public.document_status_history
for insert
to authenticated
with check (public.is_internal_user());

drop policy if exists "Internal users can read all uploaded documents" on storage.objects;
create policy "Internal users can read all uploaded documents"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'documents'
    and public.is_internal_user()
);
