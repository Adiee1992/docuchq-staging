-- Run after verifier_manager_workflow.sql.
create or replace function public.classify_document_type(document_id_input uuid, document_type_input text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_document public.documents%rowtype;
    normalized_type text := btrim(coalesce(document_type_input, ''));
begin
    if normalized_type not in ('Commercial Invoice', 'Packing List', 'Bill of Lading', 'Airway Bill', 'Shipping Bill', 'Letter of Credit', 'Bank Realization Certificate (BRC)', 'Foreign Inward Remittance Certificate (FIRC)', 'Export Declaration Form (EDF)', 'Certificate of Origin', 'Insurance Certificate', 'Purchase Order', 'Other') then
        raise exception 'Invalid document type.';
    end if;

    select * into target_document from public.documents where id = document_id_input;
    if target_document.id is null then
        raise exception 'Document not found.';
    end if;

    if not public.is_manager_user()
       and not (public.current_user_role() = 'verifier' and target_document.assigned_verifier_id = auth.uid()) then
        raise exception 'You are not allowed to classify this document.';
    end if;

    update public.documents set document_type = normalized_type, updated_at = now() where id = document_id_input;
    return normalized_type;
end;
$function$;

revoke all on function public.classify_document_type(uuid, text) from public;
grant execute on function public.classify_document_type(uuid, text) to authenticated;
notify pgrst, 'reload schema';
