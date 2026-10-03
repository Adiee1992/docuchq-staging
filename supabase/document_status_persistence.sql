-- Run after verifier_manager_workflow.sql.
-- Plan allowance is consumed at track creation; disable the legacy status-time deduction.
drop trigger if exists deduct_clearance_after_document_status_change on public.documents;

create or replace function public.update_document_review_status(
    document_id_input uuid,
    status_input text,
    reason_input text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_document public.documents%rowtype;
    normalized_status text := btrim(coalesce(status_input, ''));
begin
    if normalized_status not in ('needs_info', 'approved', 'clearance_issue') then
        raise exception 'Invalid review status.';
    end if;

    select * into target_document from public.documents where id = document_id_input for update;
    if target_document.id is null then
        raise exception 'Document not found.';
    end if;

    if not public.is_manager_user()
       and not (public.current_user_role() = 'verifier' and target_document.assigned_verifier_id = auth.uid()) then
        raise exception 'You are not allowed to review this document.';
    end if;

    update public.documents
    set status = normalized_status,
        approved_at = case when normalized_status = 'approved' then now() else null end,
        escalated_to_manager = case when public.is_manager_user() then false else escalated_to_manager end,
        escalation_reason = case when public.is_manager_user() then null else escalation_reason end,
        escalated_at = case when public.is_manager_user() then null else escalated_at end,
        updated_at = now()
    where id = document_id_input;

    insert into public.document_status_history(document_id, changed_by, old_status, new_status, reason)
    values (document_id_input, auth.uid(), target_document.status, normalized_status, nullif(btrim(coalesce(reason_input, '')), ''));

    return normalized_status;
end;
$function$;

revoke all on function public.update_document_review_status(uuid, text, text) from public;
grant execute on function public.update_document_review_status(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
