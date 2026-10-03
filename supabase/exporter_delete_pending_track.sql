create or replace function public.delete_pending_clearance_track(track_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_track public.clearance_tracks%rowtype;
    stored_objects jsonb;
begin
    select *
    into target_track
    from public.clearance_tracks
    where id = track_id_input
    for update;

    if target_track.id is null or target_track.profile_id <> auth.uid() then
        raise exception 'Pending review track was not found.';
    end if;

    if exists (
        select 1
        from public.documents
        where profile_id = auth.uid()
          and reference_id = target_track.reference_id
          and coalesce(status, '') <> 'pending_review'
    ) then
        raise exception 'Only a track whose files are all pending review can be deleted.';
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

    delete from public.clearance_tracks
    where id = target_track.id;

    return stored_objects;
end;
$$;

revoke all on function public.delete_pending_clearance_track(uuid) from public;
grant execute on function public.delete_pending_clearance_track(uuid) to authenticated;

notify pgrst, 'reload schema';
