select
    u.id as auth_user_id,
    u.email as auth_email,
    p.id as profile_id,
    p.email as profile_email,
    p.role as profile_role,
    case
        when p.id is null then 'missing profile row'
        when p.id = u.id then 'linked correctly'
        else 'profile id does not match auth user id'
    end as link_status
from auth.users u
left join public.profiles p
    on p.email = u.email
where u.email = 'REPLACE_WITH_EMAIL';
