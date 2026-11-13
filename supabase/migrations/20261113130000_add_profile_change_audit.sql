-- Append-only audit trail for customer profile edits.
-- Captures self-service edits, manager edits, and confirmed email syncs.

create table if not exists public.profile_change_logs (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null,
    changed_by uuid,
    changed_by_role text,
    source text not null check (source in ('self_service', 'manager', 'system')),
    changed_fields text[] not null check (cardinality(changed_fields) > 0),
    old_values jsonb not null default '{}'::jsonb,
    new_values jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    purge_after timestamptz not null default (now() + interval '1 year')
);

create index if not exists profile_change_logs_profile_created_idx
on public.profile_change_logs(profile_id, created_at desc);

create index if not exists profile_change_logs_actor_created_idx
on public.profile_change_logs(changed_by, created_at desc);

create index if not exists profile_change_logs_purge_idx
on public.profile_change_logs(purge_after);

alter table public.profile_change_logs enable row level security;

revoke all on public.profile_change_logs from anon, authenticated;
grant select on public.profile_change_logs to authenticated;

drop policy if exists "Managers can read profile change logs" on public.profile_change_logs;
create policy "Managers can read profile change logs"
on public.profile_change_logs
for select
to authenticated
using (public.is_manager_user());

create or replace function public.mask_profile_audit_value(field_name text, field_value text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
    value_length integer := char_length(coalesce(field_value, ''));
begin
    if field_value is null then
        return null;
    end if;

    if field_name = 'address' then
        return '[redacted]';
    end if;

    if field_name in ('mobile_number', 'gstin', 'pan') then
        if value_length <= 4 then
            return repeat('*', value_length);
        end if;
        return repeat('*', value_length - 4) || right(field_value, 4);
    end if;

    return field_value;
end;
$function$;

revoke all on function public.mask_profile_audit_value(text, text) from public;

create or replace function public.record_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    actor_id uuid := auth.uid();
    actor_role text;
    event_source text;
    fields text[] := array[]::text[];
    before_values jsonb := '{}'::jsonb;
    after_values jsonb := '{}'::jsonb;
begin
    if actor_id is not null then
        select role into actor_role
        from public.profiles
        where id = actor_id;
    end if;

    event_source := case
        when actor_id is null then 'system'
        when actor_id = new.id then 'self_service'
        when actor_role in ('manager', 'admin', 'compliance_officer') then 'manager'
        else 'system'
    end;

    if old.first_name is distinct from new.first_name then
        fields := array_append(fields, 'first_name');
        before_values := before_values || jsonb_build_object('first_name', public.mask_profile_audit_value('first_name', old.first_name));
        after_values := after_values || jsonb_build_object('first_name', public.mask_profile_audit_value('first_name', new.first_name));
    end if;
    if old.last_name is distinct from new.last_name then
        fields := array_append(fields, 'last_name');
        before_values := before_values || jsonb_build_object('last_name', public.mask_profile_audit_value('last_name', old.last_name));
        after_values := after_values || jsonb_build_object('last_name', public.mask_profile_audit_value('last_name', new.last_name));
    end if;
    if old.company_name is distinct from new.company_name then
        fields := array_append(fields, 'company_name');
        before_values := before_values || jsonb_build_object('company_name', public.mask_profile_audit_value('company_name', old.company_name));
        after_values := after_values || jsonb_build_object('company_name', public.mask_profile_audit_value('company_name', new.company_name));
    end if;
    if old.email is distinct from new.email then
        fields := array_append(fields, 'email');
        before_values := before_values || jsonb_build_object('email', public.mask_profile_audit_value('email', old.email));
        after_values := after_values || jsonb_build_object('email', public.mask_profile_audit_value('email', new.email));
    end if;
    if old.mobile_number is distinct from new.mobile_number then
        fields := array_append(fields, 'mobile_number');
        before_values := before_values || jsonb_build_object('mobile_number', public.mask_profile_audit_value('mobile_number', old.mobile_number));
        after_values := after_values || jsonb_build_object('mobile_number', public.mask_profile_audit_value('mobile_number', new.mobile_number));
    end if;
    if old.address is distinct from new.address then
        fields := array_append(fields, 'address');
        before_values := before_values || jsonb_build_object('address', public.mask_profile_audit_value('address', old.address));
        after_values := after_values || jsonb_build_object('address', public.mask_profile_audit_value('address', new.address));
    end if;
    if old.gstin is distinct from new.gstin then
        fields := array_append(fields, 'gstin');
        before_values := before_values || jsonb_build_object('gstin', public.mask_profile_audit_value('gstin', old.gstin));
        after_values := after_values || jsonb_build_object('gstin', public.mask_profile_audit_value('gstin', new.gstin));
    end if;
    if old.pan is distinct from new.pan then
        fields := array_append(fields, 'pan');
        before_values := before_values || jsonb_build_object('pan', public.mask_profile_audit_value('pan', old.pan));
        after_values := after_values || jsonb_build_object('pan', public.mask_profile_audit_value('pan', new.pan));
    end if;

    if cardinality(fields) > 0 then
        insert into public.profile_change_logs(
            profile_id,
            changed_by,
            changed_by_role,
            source,
            changed_fields,
            old_values,
            new_values
        )
        values (
            new.id,
            actor_id,
            actor_role,
            event_source,
            fields,
            before_values,
            after_values
        );
    end if;

    return new;
end;
$function$;

revoke all on function public.record_profile_change() from public;

drop trigger if exists audit_profile_changes on public.profiles;
create trigger audit_profile_changes
after update of first_name, last_name, company_name, email, mobile_number, address, gstin, pan
on public.profiles
for each row
execute function public.record_profile_change();

comment on table public.profile_change_logs is
'Append-only audit trail for monitored customer profile changes. Sensitive values are masked.';

notify pgrst, 'reload schema';
