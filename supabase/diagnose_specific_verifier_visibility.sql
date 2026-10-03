-- Replace both placeholders before running.
-- This checks whether the verifier login account, profile row, and assigned documents are linked by the same UUID.

select
    u.id as auth_user_id,
    u.email as auth_email,
    p.id as profile_id,
    p.email as profile_email,
    p.role as profile_role,
    case
        when p.id is null then 'profile row missing'
        when p.id = u.id then 'auth/profile linked correctly'
        else 'profile id does not match auth user id'
    end as profile_link_status
from auth.users u
left join public.profiles p
    on p.email = u.email
where u.email = 'VERIFIER_EMAIL_HERE';

select
    d.reference_id,
    d.title,
    d.status,
    d.assigned_verifier_id,
    p.email as assigned_verifier_email
from public.documents d
left join public.profiles p
    on p.id = d.assigned_verifier_id
where d.reference_id = 'REFERENCE_ID_HERE'
order by d.submitted_at;

-- If the verifier profile id does not match auth.users.id, fix that first:
-- update public.profiles
-- set id = 'AUTH_USER_ID_FROM_FIRST_QUERY'
-- where email = 'VERIFIER_EMAIL_HERE';

-- If the profile is linked correctly but the track is assigned to the wrong verifier, assign the track:
-- update public.documents
-- set
--     assigned_verifier_id = (
--         select id
--         from public.profiles
--         where email = 'VERIFIER_EMAIL_HERE'
--         limit 1
--     ),
--     assigned_at = coalesce(assigned_at, now()),
--     updated_at = now()
-- where reference_id = 'REFERENCE_ID_HERE';

notify pgrst, 'reload schema';
