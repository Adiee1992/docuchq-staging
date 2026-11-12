create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.clearance_tracks
add column if not exists compliant_at timestamptz,
add column if not exists purge_after timestamptz;

alter table public.user_legal_acceptances
add column if not exists account_deleted_at timestamptz,
add column if not exists retention_until timestamptz,
add column if not exists retained_user_id uuid;

alter table public.clearance_transactions add column if not exists retained_profile_id uuid;
alter table public.credit_transactions add column if not exists retained_profile_id uuid;
alter table public.free_credit_grants add column if not exists retained_profile_id uuid;
alter table public.payments add column if not exists retained_profile_id uuid;

create table if not exists public.legal_holds (
    id uuid primary key default gen_random_uuid(),
    scope text not null check (scope in ('account', 'clearance_track')),
    profile_id uuid,
    clearance_track_id uuid references public.clearance_tracks(id) on delete cascade,
    reason text not null,
    created_by uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    released_by uuid references public.profiles(id) on delete set null,
    released_at timestamptz,
    release_reason text,
    check (
        (scope = 'account' and profile_id is not null and clearance_track_id is null)
        or (scope = 'clearance_track' and clearance_track_id is not null)
    )
);

create unique index if not exists legal_holds_active_account_idx
on public.legal_holds(profile_id)
where scope = 'account' and released_at is null;

create unique index if not exists legal_holds_active_track_idx
on public.legal_holds(clearance_track_id)
where scope = 'clearance_track' and released_at is null;

create table if not exists public.retention_deletion_jobs (
    id uuid primary key default gen_random_uuid(),
    job_type text not null check (job_type in ('account', 'clearance_track', 'customer_invoice')),
    entity_id uuid not null,
    storage_objects jsonb not null default '[]'::jsonb,
    scheduled_for timestamptz not null,
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
    attempts integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    unique (job_type, entity_id)
);

create index if not exists retention_deletion_jobs_due_idx
on public.retention_deletion_jobs(status, scheduled_for);

create table if not exists public.retention_deletion_audit (
    id uuid primary key default gen_random_uuid(),
    job_type text not null,
    outcome text not null check (outcome in ('completed', 'failed')),
    deleted_database_records integer not null default 0,
    deleted_storage_objects integer not null default 0,
    occurred_at timestamptz not null default now(),
    purge_after timestamptz not null default (now() + interval '8 years'),
    details jsonb not null default '{}'::jsonb
);

alter table public.legal_holds enable row level security;
alter table public.retention_deletion_jobs enable row level security;
alter table public.retention_deletion_audit enable row level security;

grant select on public.legal_holds to authenticated;

create or replace function public.is_retention_authority()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
    select coalesce(public.current_user_role() in ('manager', 'admin', 'compliance_officer'), false)
$function$;

revoke all on function public.is_retention_authority() from public;
grant execute on function public.is_retention_authority() to authenticated, service_role;

drop policy if exists "Retention authorities manage legal holds" on public.legal_holds;
create policy "Retention authorities manage legal holds"
on public.legal_holds for all to authenticated
using (public.is_retention_authority())
with check (public.is_retention_authority());

drop policy if exists "Retention authorities read deletion audit" on public.retention_deletion_audit;
create policy "Retention authorities read deletion audit"
on public.retention_deletion_audit for select to authenticated
using (public.is_retention_authority());

revoke all on public.retention_deletion_jobs from anon, authenticated;
revoke all on public.retention_deletion_audit from anon, authenticated;
grant select on public.retention_deletion_audit to authenticated;

create or replace function public.set_clearance_track_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_profile_id uuid;
    target_reference_id text;
    target_track_id uuid;
    track_is_compliant boolean;
begin
    if tg_op = 'DELETE' then
        target_profile_id := old.profile_id;
        target_reference_id := old.reference_id;
    else
        target_profile_id := new.profile_id;
        target_reference_id := new.reference_id;
    end if;

    if target_profile_id is null or target_reference_id is null then
        if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    select id into target_track_id
    from public.clearance_tracks
    where profile_id = target_profile_id and reference_id = target_reference_id;

    if target_track_id is null then
        if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    select exists (
        select 1 from public.documents
        where profile_id = target_profile_id and reference_id = target_reference_id
    ) and not exists (
        select 1 from public.documents
        where profile_id = target_profile_id
          and reference_id = target_reference_id
          and status <> 'approved'
    ) into track_is_compliant;

    if track_is_compliant then
        update public.clearance_tracks
        set compliant_at = coalesce(compliant_at, now()),
            purge_after = coalesce(purge_after, now() + interval '1 year')
        where id = target_track_id;
    end if;

    if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

drop trigger if exists documents_set_track_retention on public.documents;
create trigger documents_set_track_retention
after insert or update of status or delete on public.documents
for each row execute function public.set_clearance_track_retention();

update public.clearance_tracks track
set compliant_at = coalesce(track.compliant_at, completed.completed_at),
    purge_after = coalesce(track.purge_after, completed.completed_at + interval '1 year')
from (
    select profile_id, reference_id, max(coalesce(approved_at, updated_at)) as completed_at
    from public.documents
    group by profile_id, reference_id
    having count(*) > 0 and bool_and(status = 'approved')
) completed
where track.profile_id = completed.profile_id
  and track.reference_id = completed.reference_id;

create or replace function public.create_legal_hold(
    scope_input text,
    profile_id_input uuid,
    clearance_track_id_input uuid,
    reason_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare hold_id uuid;
begin
    update public.retention_deletion_jobs
    set status = 'failed', last_error = 'Cleanup worker did not complete the claimed job.'
    where status = 'processing' and started_at <= now() - interval '1 hour';

    if not public.is_retention_authority() then
        raise exception 'Only a manager or Compliance Officer can create a legal hold.';
    end if;
    if nullif(btrim(reason_input), '') is null then
        raise exception 'A legal hold reason is required.';
    end if;

    insert into public.legal_holds(scope, profile_id, clearance_track_id, reason, created_by)
    values (scope_input, profile_id_input, clearance_track_id_input, btrim(reason_input), auth.uid())
    returning id into hold_id;
    return hold_id;
end;
$function$;

create or replace function public.release_legal_hold(hold_id_input uuid, reason_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
    if not public.is_retention_authority() then
        raise exception 'Only a manager or Compliance Officer can release a legal hold.';
    end if;
    update public.legal_holds
    set released_at = now(), released_by = auth.uid(), release_reason = nullif(btrim(reason_input), '')
    where id = hold_id_input and released_at is null;
    return found;
end;
$function$;

revoke all on function public.create_legal_hold(text, uuid, uuid, text) from public;
revoke all on function public.release_legal_hold(uuid, text) from public;
grant execute on function public.create_legal_hold(text, uuid, uuid, text) to authenticated;
grant execute on function public.release_legal_hold(uuid, text) to authenticated;

alter table public.clearance_transactions alter column profile_id drop not null;
alter table public.credit_transactions alter column profile_id drop not null;
alter table public.free_credit_grants alter column profile_id drop not null;
alter table public.payments alter column profile_id drop not null;

alter table public.clearance_transactions drop constraint if exists clearance_transactions_profile_id_fkey;
alter table public.clearance_transactions add constraint clearance_transactions_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null;
alter table public.credit_transactions drop constraint if exists credit_transactions_profile_id_fkey;
alter table public.credit_transactions add constraint credit_transactions_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null;
alter table public.free_credit_grants drop constraint if exists free_credit_grants_profile_id_fkey;
alter table public.free_credit_grants add constraint free_credit_grants_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null;
alter table public.payments drop constraint if exists payments_profile_id_fkey;
alter table public.payments add constraint payments_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null;

alter table public.user_legal_acceptances drop constraint if exists user_legal_acceptances_user_id_fkey;
alter table public.user_legal_acceptances alter column user_id drop not null;
alter table public.user_legal_acceptances add constraint user_legal_acceptances_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.preserve_financial_subject_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    update public.clearance_transactions set retained_profile_id = old.id where profile_id = old.id and retained_profile_id is null;
    update public.credit_transactions set retained_profile_id = old.id where profile_id = old.id and retained_profile_id is null;
    update public.free_credit_grants set retained_profile_id = old.id where profile_id = old.id and retained_profile_id is null;
    update public.payments set retained_profile_id = old.id where profile_id = old.id and retained_profile_id is null;
    return old;
end;
$function$;

drop trigger if exists profiles_preserve_financial_subject_reference on public.profiles;
create trigger profiles_preserve_financial_subject_reference
before delete on public.profiles
for each row execute function public.preserve_financial_subject_reference();

create or replace function public.prepare_retention_cleanup_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare queued_count integer := 0;
declare affected integer := 0;
begin
    insert into public.retention_deletion_jobs(job_type, entity_id, storage_objects, scheduled_for)
    select 'clearance_track', track.id,
           coalesce(files.objects, '[]'::jsonb), track.purge_after
    from public.clearance_tracks track
    left join lateral (
        select jsonb_agg(distinct object_data) as objects
        from (
            select jsonb_build_object('bucket', coalesce(document.storage_bucket, 'documents'), 'path', document.storage_path) object_data
            from public.documents document
            where document.profile_id = track.profile_id and document.reference_id = track.reference_id
              and document.storage_path is not null
            union all
            select jsonb_build_object('bucket', coalesce(version.storage_bucket, 'documents'), 'path', version.storage_path)
            from public.document_formatted_versions version
            join public.documents document on document.id = version.document_id
            where document.profile_id = track.profile_id and document.reference_id = track.reference_id
              and version.storage_path is not null
        ) paths
    ) files on true
    where track.purge_after <= now()
      and not exists (
          select 1 from public.profiles profile
          where profile.id = track.profile_id and profile.deletion_scheduled_for <= now()
      )
      and not exists (
          select 1 from public.legal_holds hold
          where hold.released_at is null
            and (hold.clearance_track_id = track.id or (hold.scope = 'account' and hold.profile_id = track.profile_id))
      )
    on conflict (job_type, entity_id) do nothing;
    get diagnostics affected = row_count;
    queued_count := queued_count + affected;

    insert into public.retention_deletion_jobs(job_type, entity_id, storage_objects, scheduled_for)
    select 'account', profile.id,
           coalesce(files.objects, '[]'::jsonb), profile.deletion_scheduled_for
    from public.profiles profile
    left join lateral (
        select jsonb_agg(distinct object_data) as objects
        from (
            select jsonb_build_object('bucket', coalesce(document.storage_bucket, 'documents'), 'path', document.storage_path) object_data
            from public.documents document
            where document.profile_id = profile.id and document.storage_path is not null
            union all
            select jsonb_build_object('bucket', coalesce(version.storage_bucket, 'documents'), 'path', version.storage_path)
            from public.document_formatted_versions version
            join public.documents document on document.id = version.document_id
            where document.profile_id = profile.id and version.storage_path is not null
        ) paths
    ) files on true
    where profile.deletion_scheduled_for <= now()
      and not exists (
          select 1 from public.legal_holds hold
          where hold.released_at is null and hold.scope = 'account' and hold.profile_id = profile.id
      )
    on conflict (job_type, entity_id) do nothing;
    get diagnostics affected = row_count;
    queued_count := queued_count + affected;

    insert into public.retention_deletion_jobs(job_type, entity_id, storage_objects, scheduled_for)
    select 'customer_invoice', invoice.id,
           jsonb_build_array(jsonb_build_object('bucket', coalesce(invoice.storage_bucket, 'documents'), 'path', invoice.storage_path)),
           invoice.created_at + interval '8 years'
    from public.customer_invoices invoice
    where invoice.created_at + interval '8 years' <= now()
      and not exists (
          select 1 from public.legal_holds hold
          where hold.released_at is null and hold.scope = 'account' and hold.profile_id = invoice.profile_id
      )
    on conflict (job_type, entity_id) do nothing;
    get diagnostics affected = row_count;
    queued_count := queued_count + affected;

    delete from public.sales_leads where created_at <= now() - interval '1 year';
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('sales_leads', 'completed', affected, '{"retention_rule":"1 year"}'::jsonb); end if;

    delete from public.customer_issues where created_at <= now() - interval '1 year';
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('customer_issues', 'completed', affected, '{"retention_rule":"1 year"}'::jsonb); end if;

    delete from public.audit_logs where created_at <= now() - interval '1 year';
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('audit_logs', 'completed', affected, '{"retention_rule":"1 year"}'::jsonb); end if;

    delete from public.exporter_iec_registry where retained_until is not null and retained_until <= now();
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('iec_registry', 'completed', affected, '{"retention_rule":"1 year after account deletion"}'::jsonb); end if;

    delete from public.clearance_transactions clearance_record
    where clearance_record.created_at <= now() - interval '8 years'
      and not exists (select 1 from public.legal_holds hold where hold.released_at is null and hold.scope = 'account' and hold.profile_id = coalesce(clearance_record.profile_id, clearance_record.retained_profile_id));
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('clearance_transactions', 'completed', affected, '{"retention_rule":"8 years"}'::jsonb); end if;

    delete from public.credit_transactions credit_record
    where credit_record.created_at <= now() - interval '8 years'
      and not exists (select 1 from public.legal_holds hold where hold.released_at is null and hold.scope = 'account' and hold.profile_id = coalesce(credit_record.profile_id, credit_record.retained_profile_id));
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('credit_transactions', 'completed', affected, '{"retention_rule":"8 years"}'::jsonb); end if;

    delete from public.free_credit_grants grant_record
    where grant_record.created_at <= now() - interval '8 years'
      and not exists (select 1 from public.legal_holds hold where hold.released_at is null and hold.scope = 'account' and hold.profile_id = coalesce(grant_record.profile_id, grant_record.retained_profile_id));
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('free_credit_grants', 'completed', affected, '{"retention_rule":"8 years"}'::jsonb); end if;

    delete from public.payments payment
    where payment.created_at <= now() - interval '8 years'
      and not exists (select 1 from public.legal_holds hold where hold.released_at is null and hold.scope = 'account' and hold.profile_id = coalesce(payment.profile_id, payment.retained_profile_id));
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('payments', 'completed', affected, '{"retention_rule":"8 years"}'::jsonb); end if;

    delete from public.customer_plan_activations activation
    where activation.created_at <= now() - interval '8 years'
      and not exists (select 1 from public.legal_holds hold where hold.released_at is null and hold.scope = 'account' and hold.profile_id = activation.profile_id);
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('plan_activations', 'completed', affected, '{"retention_rule":"8 years"}'::jsonb); end if;

    delete from public.user_legal_acceptances acceptance
    where acceptance.retention_until is not null and acceptance.retention_until <= now()
      and not exists (select 1 from public.legal_holds hold where hold.released_at is null and hold.scope = 'account' and hold.profile_id = coalesce(acceptance.user_id, acceptance.retained_user_id));
    get diagnostics affected = row_count;
    if affected > 0 then insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, details) values ('legal_acceptances', 'completed', affected, '{"retention_rule":"8 years after account deletion"}'::jsonb); end if;

    delete from public.retention_deletion_audit where purge_after <= now();

    return queued_count;
end;
$function$;

create or replace function public.claim_retention_deletion_jobs(batch_size integer default 25)
returns setof public.retention_deletion_jobs
language plpgsql
security definer
set search_path = public
as $function$
begin
    return query
    with claimed as (
        select job.id
        from public.retention_deletion_jobs job
        where job.status in ('pending', 'failed')
          and job.scheduled_for <= now()
          and job.attempts < 5
          and not exists (
              select 1 from public.legal_holds hold
              where hold.released_at is null
                and (
                    (job.job_type = 'account' and hold.scope = 'account' and hold.profile_id = job.entity_id)
                    or (job.job_type = 'clearance_track' and (hold.clearance_track_id = job.entity_id or (hold.scope = 'account' and hold.profile_id = (select profile_id from public.clearance_tracks where id = job.entity_id))))
                )
          )
        order by job.scheduled_for
        for update skip locked
        limit greatest(1, least(batch_size, 100))
    )
    update public.retention_deletion_jobs job
    set status = 'processing', attempts = attempts + 1, started_at = now(), last_error = null
    from claimed
    where job.id = claimed.id
    returning job.*;
end;
$function$;

create or replace function public.complete_retention_deletion_job(job_id_input uuid, deleted_storage_count integer default 0)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $function$
declare job public.retention_deletion_jobs%rowtype;
declare deleted_records integer := 0;
declare target_profile_id uuid;
declare target_reference_id text;
begin
    select * into job from public.retention_deletion_jobs where id = job_id_input and status = 'processing' for update;
    if not found then raise exception 'Retention deletion job is not available for completion.'; end if;

    if job.job_type = 'clearance_track' then
        select profile_id, reference_id into target_profile_id, target_reference_id
        from public.clearance_tracks where id = job.entity_id;
        delete from public.documents
        where profile_id = target_profile_id and reference_id = target_reference_id;
        get diagnostics deleted_records = row_count;
        delete from public.clearance_tracks where id = job.entity_id;
        deleted_records := deleted_records + case when found then 1 else 0 end;
    elsif job.job_type = 'customer_invoice' then
        delete from public.customer_invoices where id = job.entity_id;
        get diagnostics deleted_records = row_count;
    elsif job.job_type = 'account' then
        update public.user_legal_acceptances
        set account_deleted_at = coalesce(account_deleted_at, now()),
            retention_until = coalesce(retention_until, now() + interval '8 years'),
            retained_user_id = coalesce(retained_user_id, user_id)
        where user_id = job.entity_id;

        delete from auth.users where id = job.entity_id;
        get diagnostics deleted_records = row_count;
    end if;

    insert into public.retention_deletion_audit(job_type, outcome, deleted_database_records, deleted_storage_objects, details)
    values (job.job_type, 'completed', deleted_records, greatest(deleted_storage_count, 0), jsonb_build_object('retention_rule', case when job.job_type = 'account' then '14 days' when job.job_type = 'clearance_track' then '1 year after compliant' else '8 years' end));

    delete from public.retention_deletion_jobs where id = job.id;

    return true;
end;
$function$;

create or replace function public.fail_retention_deletion_job(job_id_input uuid, error_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare job_updated boolean := false;
begin
    update public.retention_deletion_jobs
    set status = 'failed', last_error = left(coalesce(error_input, 'Unknown cleanup error'), 1000)
    where id = job_id_input and status = 'processing';
    job_updated := found;

    insert into public.retention_deletion_audit(job_type, outcome, details)
    select job_type, 'failed', jsonb_build_object('attempts_exhausted', true, 'error', left(coalesce(error_input, 'Unknown cleanup error'), 500))
    from public.retention_deletion_jobs
    where id = job_id_input and attempts >= 5;

    return job_updated;
end;
$function$;

create or replace function public.finalize_expired_account_deletions()
returns integer
language sql
security definer
set search_path = public
as $function$
    select public.prepare_retention_cleanup_jobs()
$function$;

revoke all on function public.prepare_retention_cleanup_jobs() from public;
revoke all on function public.claim_retention_deletion_jobs(integer) from public;
revoke all on function public.complete_retention_deletion_job(uuid, integer) from public;
revoke all on function public.fail_retention_deletion_job(uuid, text) from public;
grant execute on function public.prepare_retention_cleanup_jobs() to service_role;
grant execute on function public.claim_retention_deletion_jobs(integer) to service_role;
grant execute on function public.complete_retention_deletion_job(uuid, integer) to service_role;
grant execute on function public.fail_retention_deletion_job(uuid, text) to service_role;

do $schedule$
begin
    if exists (select 1 from cron.job where jobname = 'finalize-expired-account-deletions') then
        perform cron.unschedule('finalize-expired-account-deletions');
    end if;
    if exists (select 1 from cron.job where jobname = 'prepare-daily-data-retention') then
        perform cron.unschedule('prepare-daily-data-retention');
    end if;
    perform cron.schedule('prepare-daily-data-retention', '30 2 * * *', 'select public.prepare_retention_cleanup_jobs();');
end;
$schedule$;

create or replace function public.configure_data_retention_edge_schedule()
returns boolean
language plpgsql
security definer
set search_path = public, cron, vault
as $function$
declare
    has_project_url boolean;
    has_service_key boolean;
begin
    select exists (select 1 from vault.decrypted_secrets where name = 'project_url') into has_project_url;
    select exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') into has_service_key;

    if not has_project_url or not has_service_key then
        raise exception 'Add project_url and service_role_key to Supabase Vault before scheduling retention cleanup.';
    end if;

    if exists (select 1 from cron.job where jobname = 'process-daily-data-retention') then
        perform cron.unschedule('process-daily-data-retention');
    end if;

    perform cron.schedule(
        'process-daily-data-retention',
        '45 2 * * *',
        $command$
        select net.http_post(
            url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/data-retention-cleanup',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
            ),
            body := '{}'::jsonb
        );
        $command$
    );
    return true;
end;
$function$;

revoke all on function public.configure_data_retention_edge_schedule() from public;
grant execute on function public.configure_data_retention_edge_schedule() to service_role;

do $configure$
begin
    if exists (select 1 from vault.decrypted_secrets where name = 'project_url')
       and exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
        perform public.configure_data_retention_edge_schedule();
    else
        raise notice 'Retention Edge Function cron is not scheduled yet. Add project_url and service_role_key to Vault, then run select public.configure_data_retention_edge_schedule();';
    end if;
end;
$configure$;

notify pgrst, 'reload schema';
