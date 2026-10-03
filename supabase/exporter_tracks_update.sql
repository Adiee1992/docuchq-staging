alter table public.documents
add column if not exists payment_method text;

alter table public.documents
add column if not exists ad_bank_name text;

alter table public.documents
add column if not exists notes text;

alter table public.documents
drop constraint if exists documents_payment_method_check;

alter table public.documents
add constraint documents_payment_method_check check (
    payment_method is null
    or payment_method in ('LC', 'Non-LC')
);

drop policy if exists "Exporters can mark own documents clearance issue" on public.documents;
create policy "Exporters can mark own documents clearance issue"
on public.documents
for update
to authenticated
using (
    profile_id = auth.uid()
    and status = 'approved'
)
with check (
    profile_id = auth.uid()
    and status = 'clearance_issue'
);

drop policy if exists "Exporters can insert own status history" on public.document_status_history;
create policy "Exporters can insert own status history"
on public.document_status_history
for insert
to authenticated
with check (
    changed_by = auth.uid()
    and exists (
        select 1
        from public.documents d
        where d.id = document_status_history.document_id
        and d.profile_id = auth.uid()
    )
);

notify pgrst, 'reload schema';
