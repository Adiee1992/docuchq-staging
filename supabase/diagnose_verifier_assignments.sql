select
    id,
    email,
    first_name,
    last_name,
    role
from public.profiles
where role = 'verifier'
order by created_at;

select
    reference_id,
    count(*) as file_count,
    assigned_verifier_id,
    min(submitted_at) as first_submitted_at,
    max(status) as sample_status
from public.documents
group by reference_id, assigned_verifier_id
order by first_submitted_at desc;

select
    d.reference_id,
    d.title,
    d.status,
    d.assigned_verifier_id,
    p.email as assigned_verifier_email
from public.documents d
left join public.profiles p
    on p.id = d.assigned_verifier_id
order by d.submitted_at desc;
