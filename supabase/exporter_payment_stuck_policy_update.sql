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

notify pgrst, 'reload schema';
