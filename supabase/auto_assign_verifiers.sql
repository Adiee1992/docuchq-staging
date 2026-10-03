create or replace function public.assign_document_to_verifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_verifier_id uuid;
begin
    if new.assigned_verifier_id is not null then
        return new;
    end if;

    if new.reference_id is not null then
        select d.assigned_verifier_id
        into selected_verifier_id
        from public.documents d
        where d.profile_id = new.profile_id
        and d.reference_id = new.reference_id
        and d.assigned_verifier_id is not null
        order by d.submitted_at asc
        limit 1;
    end if;

    if selected_verifier_id is null then
        select p.id
        into selected_verifier_id
        from public.profiles p
        left join public.documents d
            on d.assigned_verifier_id = p.id
            and d.status not in ('approved', 'clearance_issue', 'rejected', 'cancelled')
        where p.role = 'verifier'
        group by p.id
        order by count(distinct d.reference_id) asc, p.created_at asc
        limit 1;
    end if;

    if selected_verifier_id is not null then
        new.assigned_verifier_id = selected_verifier_id;
        new.assigned_at = coalesce(new.assigned_at, now());
    end if;

    return new;
end;
$$;

drop trigger if exists before_document_auto_assign_verifier on public.documents;

create trigger before_document_auto_assign_verifier
before insert on public.documents
for each row execute function public.assign_document_to_verifier();

with unassigned_tracks as (
    select
        d.profile_id,
        d.reference_id,
        min(d.submitted_at) as first_submitted_at,
        row_number() over (order by min(d.submitted_at), d.profile_id, d.reference_id) as track_number
    from public.documents d
    where d.assigned_verifier_id is null
    and d.reference_id is not null
    group by d.profile_id, d.reference_id
),
verifier_pool as (
    select
        p.id,
        row_number() over (order by p.created_at, p.id) as verifier_number,
        count(*) over () as verifier_count
    from public.profiles p
    where p.role = 'verifier'
),
track_assignments as (
    select
        t.profile_id,
        t.reference_id,
        v.id as verifier_id
    from unassigned_tracks t
    join verifier_pool v
        on ((t.track_number - 1) % v.verifier_count) + 1 = v.verifier_number
)
update public.documents d
set
    assigned_verifier_id = ta.verifier_id,
    assigned_at = coalesce(d.assigned_at, now()),
    updated_at = now()
from track_assignments ta
where d.profile_id = ta.profile_id
and d.reference_id = ta.reference_id
and d.assigned_verifier_id is null;

insert into public.document_assignments (
    document_id,
    assigned_from,
    assigned_to,
    assigned_by,
    assignment_type,
    reason
)
select
    d.id,
    null,
    d.assigned_verifier_id,
    null,
    'auto',
    'Auto-assigned by verifier load balancing'
from public.documents d
where d.assigned_verifier_id is not null
and not exists (
    select 1
    from public.document_assignments da
    where da.document_id = d.id
    and da.assignment_type = 'auto'
);

notify pgrst, 'reload schema';
