alter table public.document_status_history enable row level security;

drop policy if exists "Exporters can read own document status history simple" on public.document_status_history;
create policy "Exporters can read own document status history simple"
on public.document_status_history
for select
to authenticated
using (
    exists (
        select 1
        from public.documents d
        where d.id = document_status_history.document_id
        and d.profile_id = auth.uid()
    )
);

drop policy if exists "Verifiers can read assigned status history simple" on public.document_status_history;
create policy "Verifiers can read assigned status history simple"
on public.document_status_history
for select
to authenticated
using (
    exists (
        select 1
        from public.documents d
        where d.id = document_status_history.document_id
        and d.assigned_verifier_id = auth.uid()
    )
);

drop policy if exists "Verifiers can insert assigned status history simple" on public.document_status_history;
create policy "Verifiers can insert assigned status history simple"
on public.document_status_history
for insert
to authenticated
with check (
    changed_by = auth.uid()
    and exists (
        select 1
        from public.documents d
        where d.id = document_status_history.document_id
        and d.assigned_verifier_id = auth.uid()
    )
);

drop policy if exists "Managers can read all status history simple" on public.document_status_history;
create policy "Managers can read all status history simple"
on public.document_status_history
for select
to authenticated
using (public.is_manager_user());

drop policy if exists "Managers can insert status history simple" on public.document_status_history;
create policy "Managers can insert status history simple"
on public.document_status_history
for insert
to authenticated
with check (
    changed_by = auth.uid()
    and public.is_manager_user()
);

notify pgrst, 'reload schema';
