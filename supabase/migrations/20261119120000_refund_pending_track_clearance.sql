-- Return one consumed clearance when an exporter deletes a track before review
-- starts. The row locks and ledger checks make the refund atomic and prevent a
-- duplicate credit. Any manager/verifier status change permanently locks the
-- track against exporter deletion, even if its current status were reverted.

create or replace function public.delete_pending_clearance_track(track_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_track public.clearance_tracks%rowtype;
    target_profile public.profiles%rowtype;
    target_activation public.customer_plan_activations%rowtype;
    stored_objects jsonb;
    previous_balance integer;
    new_balance integer;
    has_recorded_deduction boolean := false;
    deduction_plan_type text;
begin
    select *
    into target_track
    from public.clearance_tracks
    where id = track_id_input
    for update;

    if auth.uid() is null or target_track.id is null or target_track.profile_id is distinct from auth.uid() then
        raise exception 'Pending review track was not found.';
    end if;

    perform 1
    from public.documents
    where profile_id = auth.uid()
      and reference_id = target_track.reference_id
    for update;

    if exists (
        select 1
        from public.documents
        where profile_id = auth.uid()
          and reference_id = target_track.reference_id
          and coalesce(status, '') <> 'pending_review'
    ) then
        raise exception 'Only a track whose files are all pending review can be deleted.';
    end if;

    if exists (
        select 1
        from public.document_status_history history
        join public.documents document on document.id = history.document_id
        join public.user_roles actor_role on actor_role.user_id = history.changed_by
        where document.profile_id = auth.uid()
          and document.reference_id = target_track.reference_id
          and actor_role.role in ('verifier', 'manager', 'admin', 'compliance_officer')
          and coalesce(history.old_status, '') is distinct from history.new_status
    ) then
        raise exception 'This track cannot be deleted because document review has already started.';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'bucket', coalesce(storage_bucket, 'documents'),
                'path', storage_path
            )
        ) filter (where storage_path is not null),
        '[]'::jsonb
    )
    into stored_objects
    from public.documents
    where profile_id = auth.uid()
      and reference_id = target_track.reference_id;

    delete from public.documents
    where profile_id = auth.uid()
      and reference_id = target_track.reference_id;

    select exists (
        select 1
        from public.clearance_transactions
        where track_id = target_track.id
          and transaction_type = 'deduction'
    ) and not exists (
        select 1
        from public.clearance_transactions
        where track_id = target_track.id
          and transaction_type = 'refund'
    )
    into has_recorded_deduction;

    if not has_recorded_deduction then
        raise exception 'The clearance deduction could not be verified, so the track was not deleted.';
    end if;

    select plan_type
    into deduction_plan_type
    from public.clearance_transactions
    where track_id = target_track.id
      and transaction_type = 'deduction'
    limit 1;

    if has_recorded_deduction then
        select *
        into target_profile
        from public.profiles
        where id = target_track.profile_id
        for update;

        if target_profile.id is null then
            raise exception 'Exporter profile was not found.';
        end if;

        previous_balance := coalesce(target_profile.available_clearances, 0);

        if target_track.plan_activation_id is not null then
            select *
            into target_activation
            from public.customer_plan_activations
            where id = target_track.plan_activation_id
              and profile_id = target_track.profile_id
            for update;

            if target_activation.id is not null then
                update public.customer_plan_activations
                set tracks_used = greatest(tracks_used - 1, 0),
                    status = case when status = 'exhausted' then 'active' else status end,
                    updated_at = now()
                where id = target_activation.id;
            end if;
        end if;

        update public.profiles
        set available_clearances = previous_balance + 1,
            updated_at = now()
        where id = target_track.profile_id
        returning available_clearances into new_balance;

        insert into public.clearance_transactions (
            profile_id,
            track_id,
            reference_id,
            plan_activation_id,
            plan_type,
            transaction_type,
            amount,
            balance_before,
            balance_after,
            reason,
            actor_id,
            customer_name_snapshot,
            buyer_name_snapshot,
            company_name_snapshot,
            email_snapshot,
            created_at
        ) values (
            target_track.profile_id,
            target_track.id,
            target_track.reference_id,
            target_track.plan_activation_id,
            coalesce(target_activation.plan_type, deduction_plan_type),
            'refund',
            1,
            previous_balance,
            new_balance,
            'Pending review clearance deleted',
            auth.uid(),
            nullif(btrim(concat_ws(' ', target_profile.first_name, target_profile.last_name)), ''),
            target_track.customer_name,
            target_profile.company_name,
            target_profile.email,
            now()
        );
    end if;

    delete from public.clearance_tracks
    where id = target_track.id;

    return stored_objects;
end;
$function$;

revoke all on function public.delete_pending_clearance_track(uuid) from public, anon;
grant execute on function public.delete_pending_clearance_track(uuid) to authenticated;

notify pgrst, 'reload schema';
