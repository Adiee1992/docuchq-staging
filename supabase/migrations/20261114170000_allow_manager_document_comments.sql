-- Managers can review every document, but the original comment policies only
-- allowed exporters and assigned verifiers to insert/read comments.
drop policy if exists "Managers can read document comments" on public.document_comments;
create policy "Managers can read document comments"
on public.document_comments
for select
to authenticated
using (public.is_manager_user());

drop policy if exists "Managers can add document comments" on public.document_comments;
create policy "Managers can add document comments"
on public.document_comments
for insert
to authenticated
with check (
    author_id = auth.uid()
    and public.is_manager_user()
    and exists (
        select 1
        from public.documents document
        where document.id = document_comments.document_id
    )
);

notify pgrst, 'reload schema';
