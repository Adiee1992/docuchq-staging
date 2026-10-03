create table if not exists public.document_formatted_versions (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    uploaded_by uuid not null,
    storage_bucket text not null default 'documents',
    storage_path text not null unique,
    file_name text not null,
    file_size bigint not null check (file_size > 0),
    mime_type text not null default 'application/octet-stream',
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists document_formatted_versions_document_created_idx on public.document_formatted_versions(document_id, created_at desc);
alter table public.document_formatted_versions enable row level security;
grant select, insert on public.document_formatted_versions to authenticated;

create policy "Visible users can read formatted versions" on public.document_formatted_versions for select to authenticated using (
    exists (select 1 from public.documents d where d.id = document_id and (d.profile_id = auth.uid() or d.assigned_verifier_id = auth.uid() or public.is_manager_user()))
);
create policy "Reviewers can add formatted versions" on public.document_formatted_versions for insert to authenticated with check (
    uploaded_by = auth.uid() and exists (select 1 from public.documents d where d.id = document_id and (d.assigned_verifier_id = auth.uid() or public.is_manager_user()))
);

create policy "Internal users can upload formatted files" on storage.objects for insert to authenticated with check (
    bucket_id = 'documents' and public.is_internal_user() and split_part(name, '/', 1) = 'formatted' and split_part(name, '/', 2) = auth.uid()::text
);
create policy "Owners can read formatted files" on storage.objects for select to authenticated using (
    bucket_id = 'documents' and exists (
        select 1 from public.document_formatted_versions version
        join public.documents d on d.id = version.document_id
        where version.storage_path = storage.objects.name and d.profile_id = auth.uid()
    )
);

notify pgrst, 'reload schema';
