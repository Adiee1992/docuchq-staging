-- Plan entitlements now consume clearance allowance when a track is created.
-- The legacy status-time deduction attempted to insert the existing track again,
-- which incorrectly invoked the new-track plan guard during document review.

drop trigger if exists deduct_clearance_after_document_status_change on public.documents;

create or replace function public.deduct_clearance_for_processed_track(document_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
    return false;
end;
$function$;

grant execute on function public.deduct_clearance_for_processed_track(uuid) to authenticated;
notify pgrst, 'reload schema';
