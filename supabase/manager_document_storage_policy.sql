drop policy if exists "Managers can read all document files" on storage.objects;
create policy "Managers can read all document files"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'documents'
    and public.is_manager_user()
);

notify pgrst, 'reload schema';
