-- Profiles and trial plans are provisioned by on_auth_user_created during signup.
-- The legacy verification trigger attempted a second profile write when the email
-- was confirmed and could make GoTrue return "Database error saving new user".
drop trigger if exists on_auth_user_verified on auth.users;

-- Keep the function for rollback compatibility, but make it safely idempotent if
-- it is invoked manually or restored by an older environment.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    update public.profiles
    set email = new.email,
        updated_at = now()
    where id = new.id
      and email is distinct from new.email;

    return new;
end;
$function$;

notify pgrst, 'reload schema';
