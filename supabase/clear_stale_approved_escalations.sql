-- Approved documents are resolved review outcomes and should no longer remain
-- in the active escalation queue.
update public.documents
set
    escalated_to_manager = false,
    escalation_reason = null,
    escalated_at = null,
    updated_at = now()
where status = 'approved'
  and escalated_to_manager = true;
