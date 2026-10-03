-- Replace VERIFIER_ID_FROM_DASHBOARD with the UUID shown in the verifier dashboard diagnostic strip.

select
    id,
    email,
    role
from public.profiles
where id = 'VERIFIER_ID_FROM_DASHBOARD';

select
    id,
    reference_id,
    title,
    status,
    assigned_verifier_id,
    submitted_at
from public.documents
where assigned_verifier_id = 'VERIFIER_ID_FROM_DASHBOARD'
order by submitted_at desc;
