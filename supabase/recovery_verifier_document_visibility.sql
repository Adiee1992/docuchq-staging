alter table public.documents enable row level security;

drop policy if exists "Verifiers can read assigned documents simple" on public.documents;
create policy "Verifiers can read assigned documents simple"
on public.documents
for select
to authenticated
using (
    assigned_verifier_id = auth.uid()
);

drop policy if exists "Verifiers can update assigned documents simple" on public.documents;
create policy "Verifiers can update assigned documents simple"
on public.documents
for update
to authenticated
using (
    assigned_verifier_id = auth.uid()
)
with check (
    assigned_verifier_id = auth.uid()
);

drop policy if exists "Verifiers can read comments on assigned documents simple" on public.document_comments;
create policy "Verifiers can read comments on assigned documents simple"
on public.document_comments
for select
to authenticated
using (
    exists (
        select 1
        from public.documents d
        where d.id = document_comments.document_id
        and d.assigned_verifier_id = auth.uid()
    )
);

drop policy if exists "Verifiers can comment on assigned documents simple" on public.document_comments;
create policy "Verifiers can comment on assigned documents simple"
on public.document_comments
for insert
to authenticated
with check (
    author_id = auth.uid()
    and exists (
        select 1
        from public.documents d
        where d.id = document_comments.document_id
        and d.assigned_verifier_id = auth.uid()
    )
);

drop policy if exists "Verifiers can read assigned document files simple" on storage.objects;
create policy "Verifiers can read assigned document files simple"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'documents'
    and exists (
        select 1
        from public.documents d
        where d.storage_path = storage.objects.name
        and d.assigned_verifier_id = auth.uid()
    )
);

notify pgrst, 'reload schema';
