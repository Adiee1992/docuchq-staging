drop policy if exists "Exporters can delete unlocked own documents" on public.documents;
create policy "Exporters can delete unlocked own documents"
on public.documents
for delete
to authenticated
using (
    profile_id = auth.uid()
    and status not in ('needs_info', 'approved', 'clearance_issue')
);
