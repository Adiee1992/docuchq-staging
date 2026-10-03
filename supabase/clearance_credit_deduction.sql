alter table public.clearance_tracks
add column if not exists clearance_deducted boolean not null default false;

create or replace function public.deduct_clearance_for_processed_track(document_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    target_document public.documents%rowtype;
    target_reference text;
    did_deduct boolean := false;
    track_document_count integer := 0;
    track_has_needs_info boolean := false;
    track_all_approved boolean := false;
begin
    select *
    into target_document
    from public.documents
    where id = document_id_input;

    if target_document.id is null then
        raise exception 'Document not found';
    end if;

    target_reference := coalesce(target_document.reference_id, 'UNREFERENCED');

    select
        count(*),
        coalesce(bool_or(status = 'needs_info'), false),
        coalesce(bool_and(status = 'approved'), false)
    into
        track_document_count,
        track_has_needs_info,
        track_all_approved
    from public.documents
    where profile_id = target_document.profile_id
      and coalesce(reference_id, 'UNREFERENCED') = target_reference;

    if track_document_count = 0 or not (track_has_needs_info or track_all_approved) then
        return false;
    end if;

    insert into public.clearance_tracks (
        profile_id,
        reference_id,
        customer_name,
        destination_country,
        invoice_currency,
        ad_bank_name,
        payment_method,
        clearance_deducted
    )
    values (
        target_document.profile_id,
        target_reference,
        target_document.customer_name,
        target_document.destination_country,
        target_document.invoice_currency,
        target_document.ad_bank_name,
        target_document.payment_method,
        false
    )
    on conflict (profile_id, reference_id) do nothing;

    update public.clearance_tracks
    set clearance_deducted = true
    where profile_id = target_document.profile_id
      and reference_id = target_reference
      and clearance_deducted = false
    returning true into did_deduct;

    if did_deduct then
        update public.profiles
        set available_clearances = greatest(coalesce(available_clearances, 0) - 1, 0)
        where id = target_document.profile_id;
    end if;

    return coalesce(did_deduct, false);
end;
$$;

grant execute on function public.deduct_clearance_for_processed_track(uuid) to authenticated;

create or replace function public.deduct_clearance_after_document_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status in ('needs_info', 'approved')
       and coalesce(old.status, '') is distinct from new.status then
        perform public.deduct_clearance_for_processed_track(new.id);
    end if;

    return new;
end;
$$;

drop trigger if exists deduct_clearance_after_document_status_change on public.documents;
create trigger deduct_clearance_after_document_status_change
after update of status on public.documents
for each row
execute function public.deduct_clearance_after_document_status_change();

notify pgrst, 'reload schema';
