SET local check_function_bodies = off;

CREATE EXTENSION "pg_cron";

CREATE EXTENSION "pg_net" SCHEMA "extensions";

CREATE TABLE "public"."audit_logs" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"    uuid,
  "entity_type" text                     NOT NULL,
  "entity_id"   uuid,
  "action"      text                     NOT NULL,
  "metadata"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."audit_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clearance_tracks" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"          uuid                     NOT NULL,
  "reference_id"        text                     NOT NULL,
  "customer_name"       text,
  "destination_country" text,
  "invoice_currency"    text                     DEFAULT 'INR'::text,
  "ad_bank_name"        text,
  "payment_method"      text                     DEFAULT 'LC'::text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "clearance_deducted"  boolean                  NOT NULL DEFAULT false,
  "plan_activation_id"  uuid,
  CONSTRAINT "clearance_tracks_pkey" PRIMARY KEY (id),
  CONSTRAINT "clearance_tracks_profile_id_reference_id_key" UNIQUE (profile_id, reference_id)
);

ALTER TABLE "public"."clearance_tracks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clearance_transactions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"       uuid                     NOT NULL,
  "document_id"      uuid,
  "transaction_type" text                     NOT NULL,
  "amount"           integer                  NOT NULL,
  "balance_after"    integer,
  "reason"           text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clearance_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "clearance_transactions_type_check" CHECK ((transaction_type = ANY (ARRAY['purchase'::text, 'deduction'::text, 'refund'::text, 'manual_adjustment'::text])))
);

ALTER TABLE "public"."clearance_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."credit_transactions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"       uuid                     NOT NULL,
  "transaction_type" text                     NOT NULL,
  "credits"          integer                  NOT NULL,
  "amount"           numeric(12,2),
  "currency"         text                     NOT NULL DEFAULT 'INR'::text,
  "description"      text,
  "status"           text                     NOT NULL DEFAULT 'completed'::text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "credit_transactions_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['purchase'::text, 'usage'::text, 'adjustment'::text])))
);

ALTER TABLE "public"."credit_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."customer_invoices" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"     uuid                     NOT NULL,
  "invoice_number" text                     NOT NULL,
  "storage_bucket" text                     NOT NULL DEFAULT 'documents'::text,
  "storage_path"   text                     NOT NULL,
  "file_name"      text                     NOT NULL,
  "file_size"      bigint                   NOT NULL,
  "mime_type"      text                     NOT NULL DEFAULT 'application/pdf'::text,
  "uploaded_by"    uuid                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_invoices_storage_path_key" UNIQUE (storage_path)
);

ALTER TABLE "public"."customer_invoices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."customer_issues" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"    uuid                     NOT NULL,
  "full_name"     text                     NOT NULL,
  "company_name"  text,
  "email"         text                     NOT NULL,
  "mobile_number" text,
  "comments"      text                     NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'new'::text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "viewed_at"     timestamp with time zone,
  CONSTRAINT "customer_issues_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_issues_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'viewed'::text])))
);

ALTER TABLE "public"."customer_issues"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."customer_plan_activations" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"        uuid                     NOT NULL,
  "plan_type"         text                     NOT NULL,
  "status"            text                     NOT NULL DEFAULT 'active'::text,
  "starts_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"        timestamp with time zone,
  "track_limit"       integer,
  "tracks_used"       integer                  NOT NULL DEFAULT 0,
  "amount"            numeric(12,2),
  "currency"          text                     NOT NULL DEFAULT 'INR'::text,
  "payment_method"    text,
  "payment_reference" text,
  "payment_date"      date,
  "notes"             text,
  "activated_by"      uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_plan_activation_limits_check" CHECK ((((plan_type = 'trial'::text) AND (track_limit = 1) AND (expires_at IS
    NOT NULL)) OR ((plan_type = 'standard'::text) AND (track_limit = 10) AND (expires_at IS NOT NULL)) OR ((plan_type = 'business'::text) AND (track_limit = 25) AND (expires_at IS
    NOT NULL)))),
  CONSTRAINT "customer_plan_activations_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_plan_activations_plan_type_check" CHECK ((plan_type = ANY (ARRAY['trial'::text, 'standard'::text, 'business'::text]))),
  CONSTRAINT "customer_plan_activations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'exhausted'::text, 'replaced'::text, 'cancelled'::text]))),
  CONSTRAINT "customer_plan_activations_track_limit_check" CHECK (((track_limit IS NULL) OR (track_limit >= 0))),
  CONSTRAINT "customer_plan_activations_tracks_used_check" CHECK ((tracks_used >= 0))
);

ALTER TABLE "public"."customer_plan_activations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."document_assignments" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "document_id"     uuid                     NOT NULL,
  "assigned_from"   uuid,
  "assigned_to"     uuid,
  "assigned_by"     uuid,
  "assignment_type" text                     NOT NULL DEFAULT 'manual'::text,
  "reason"          text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "document_assignments_type_check" CHECK ((assignment_type = ANY (ARRAY['manual'::text, 'escalation'::text, 'takeover'::text, 'auto'::text])))
);

ALTER TABLE "public"."document_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."document_comments" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "document_id" uuid                     NOT NULL,
  "author_id"   uuid                     NOT NULL,
  "comment"     text                     NOT NULL,
  "is_internal" boolean                  NOT NULL DEFAULT false,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_comments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."document_comments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."document_formatted_versions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "document_id"    uuid                     NOT NULL,
  "uploaded_by"    uuid                     NOT NULL,
  "storage_bucket" text                     NOT NULL DEFAULT 'documents'::text,
  "storage_path"   text                     NOT NULL,
  "file_name"      text                     NOT NULL,
  "file_size"      bigint                   NOT NULL,
  "mime_type"      text                     NOT NULL DEFAULT 'application/octet-stream'::text,
  "notes"          text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_formatted_versions_file_size_check" CHECK ((file_size > 0)),
  CONSTRAINT "document_formatted_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "document_formatted_versions_storage_path_key" UNIQUE (storage_path)
);

ALTER TABLE "public"."document_formatted_versions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."document_status_history" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "document_id" uuid                     NOT NULL,
  "changed_by"  uuid,
  "old_status"  text,
  "new_status"  text                     NOT NULL,
  "reason"      text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_status_history_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."document_status_history"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."documents" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"           uuid                     NOT NULL,
  "title"                text                     NOT NULL,
  "document_type"        text,
  "reference_id"         text,
  "storage_bucket"       text                     NOT NULL DEFAULT 'documents'::text,
  "storage_path"         text                     NOT NULL,
  "file_name"            text,
  "file_size"            bigint,
  "mime_type"            text,
  "status"               text                     NOT NULL DEFAULT 'pending_review'::text,
  "submitted_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "approved_at"          timestamp with time zone,
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "payment_method"       text,
  "ad_bank_name"         text,
  "notes"                text,
  "assigned_verifier_id" uuid,
  "assigned_manager_id"  uuid,
  "assigned_at"          timestamp with time zone,
  "escalated_to_manager" boolean                  NOT NULL DEFAULT false,
  "escalation_reason"    text,
  "escalated_at"         timestamp with time zone,
  "deleted_at"           timestamp with time zone,
  "deleted_by"           uuid,
  "deleted_reason"       text,
  "customer_name"        text,
  "destination_country"  text,
  "invoice_currency"     text,
  CONSTRAINT "documents_payment_method_check" CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['LC'::text, 'Non-LC'::text])))),
  CONSTRAINT "documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "documents_status_check"
    CHECK ((status = ANY (ARRAY['pending_review'::text, 'needs_info'::text, 'approved'::text, 'clearance_issue'::text, 'rejected'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."documents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exporter_iec_registry" (
  "iec_code"                        text                     NOT NULL,
  "first_user_id"                   uuid                     NOT NULL,
  "first_registered_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "introductory_clearances_granted" integer                  NOT NULL DEFAULT 1,
  "retained_until"                  timestamp with time zone,
  CONSTRAINT "exporter_iec_registry_iec_code_check" CHECK ((iec_code ~ '^[A-Z0-9]{10}$'::text)),
  CONSTRAINT "exporter_iec_registry_pkey" PRIMARY KEY (iec_code),
  CONSTRAINT "exporter_iec_registry_trial_grant_check" CHECK ((introductory_clearances_granted = 1))
);

ALTER TABLE "public"."exporter_iec_registry"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."exporter_iec_registry" FROM "anon", "authenticated";

CREATE TABLE "public"."free_credit_grants" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" uuid                     NOT NULL,
  "granted_by" uuid                     NOT NULL,
  "credits"    integer                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "free_credit_grants_credits_check" CHECK (((credits >= 1) AND (credits <= 5))),
  CONSTRAINT "free_credit_grants_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."free_credit_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"           uuid                     NOT NULL,
  "provider"             text                     NOT NULL DEFAULT 'razorpay'::text,
  "provider_order_id"    text,
  "provider_payment_id"  text,
  "amount"               integer                  NOT NULL,
  "currency"             text                     NOT NULL DEFAULT 'INR'::text,
  "clearances_purchased" integer                  NOT NULL DEFAULT 0,
  "status"               text                     NOT NULL DEFAULT 'created'::text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "paid_at"              timestamp with time zone,
  CONSTRAINT "payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "payments_status_check" CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "role"                   text                     DEFAULT ''::text,
  "company_name"           text                     DEFAULT ''::text,
  "first_name"             text                     DEFAULT ''::text,
  "last_name"              text                     DEFAULT ''::text,
  "email"                  text                     DEFAULT ''::text,
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "available_clearances"   integer                  NOT NULL DEFAULT 1,
  "mobile_number"          text,
  "address"                text,
  "gstin"                  text,
  "pan"                    text,
  "iec_code"               text,
  "deletion_requested_at"  timestamp with time zone,
  "deletion_scheduled_for" timestamp with time zone,
  "account_status"         text                     NOT NULL DEFAULT 'active'::text,
  CONSTRAINT "profiles_account_status_check" CHECK ((account_status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sales_leads" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "full_name"     text                     NOT NULL,
  "company_name"  text                     NOT NULL,
  "email"         text                     NOT NULL,
  "mobile_number" text                     NOT NULL,
  "comments"      text,
  "status"        text                     NOT NULL DEFAULT 'new'::text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "viewed_at"     timestamp with time zone,
  CONSTRAINT "sales_leads_pkey" PRIMARY KEY (id),
  CONSTRAINT "sales_leads_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'viewed'::text])))
);

ALTER TABLE "public"."sales_leads"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.activate_customer_plan (
  customer_id_input       uuid,
  plan_type_input         text,
  amount_input            numeric,
  payment_reference_input text,
  payment_date_input      date,
  payment_method_input    text    DEFAULT 'bank_transfer'::text,
  notes_input             text    DEFAULT NULL::text
)
  RETURNS public.customer_plan_activations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    customer_profile public.profiles%rowtype;
    activation public.customer_plan_activations%rowtype;
    normalized_reference text := upper(trim(coalesce(payment_reference_input, '')));
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can activate customer plans.';
    end if;

    if plan_type_input not in ('standard', 'business') then
        raise exception 'Plan must be Standard or Business.';
    end if;

    if amount_input is null or amount_input < 0 then
        raise exception 'Enter a valid payment amount.';
    end if;

    if normalized_reference = '' then
        raise exception 'Payment reference is required.';
    end if;

    if payment_date_input is null then
        raise exception 'Payment date is required.';
    end if;

    select *
    into customer_profile
    from public.profiles
    where id = customer_id_input
      and role = 'exporter';

    if customer_profile.id is null then
        raise exception 'Exporter account not found.';
    end if;

    update public.customer_plan_activations
    set status = 'replaced', updated_at = now()
    where profile_id = customer_id_input
      and status = 'active';

    insert into public.customer_plan_activations (
        profile_id,
        plan_type,
        status,
        starts_at,
        expires_at,
        track_limit,
        tracks_used,
        amount,
        currency,
        payment_method,
        payment_reference,
        payment_date,
        notes,
        activated_by
    )
    values (
        customer_id_input,
        plan_type_input,
        'active',
        now(),
        now() + interval '30 days',
        case when plan_type_input = 'standard' then 10 else null end,
        0,
        amount_input,
        'INR',
        nullif(trim(payment_method_input), ''),
        normalized_reference,
        payment_date_input,
        nullif(trim(notes_input), ''),
        auth.uid()
    )
    returning * into activation;

    update public.profiles
    set available_clearances = case when plan_type_input = 'standard' then 10 else 0 end,
        updated_at = now()
    where id = customer_id_input;

    insert into public.credit_transactions (
        profile_id,
        transaction_type,
        credits,
        amount,
        currency,
        description,
        status
    )
    values (
        customer_id_input,
        'purchase',
        case when plan_type_input = 'standard' then 10 else 0 end,
        amount_input,
        'INR',
        initcap(plan_type_input) || ' plan activated after manual payment verification',
        'completed'
    );

    insert into public.audit_logs (
        actor_id,
        entity_type,
        entity_id,
        action,
        metadata
    )
    values (
        auth.uid(),
        'plan_activation',
        activation.id,
        'manual_plan_activation',
        jsonb_build_object(
            'customer_id', customer_id_input,
            'customer_email', customer_profile.email,
            'plan_type', plan_type_input,
            'amount', amount_input,
            'payment_reference', normalized_reference,
            'payment_date', payment_date_input,
            'starts_at', activation.starts_at,
            'expires_at', activation.expires_at
        )
    );

    return activation;
exception
    when unique_violation then
        raise exception 'This payment reference has already been used.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_document_to_verifier()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.classify_document_type (
  document_id_input   uuid,
  document_type_input text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    target_document public.documents%rowtype;
    normalized_type text := btrim(coalesce(document_type_input, ''));
begin
    if normalized_type not in ('Commercial Invoice', 'Packing List', 'Bill of Lading', 'Airway Bill', 'Shipping Bill', 'Letter of Credit', 'Bank Realization Certificate (BRC)', 'Foreign Inward Remittance Certificate (FIRC)', 'Export Declaration Form (EDF)', 'Certificate of Origin', 'Insurance Certificate', 'Purchase Order', 'Other') then
        raise exception 'Invalid document type.';
    end if;

    select * into target_document from public.documents where id = document_id_input;
    if target_document.id is null then
        raise exception 'Document not found.';
    end if;

    if not public.is_manager_user()
       and not (public.current_user_role() = 'verifier' and target_document.assigned_verifier_id = auth.uid()) then
        raise exception 'You are not allowed to classify this document.';
    end if;

    update public.documents set document_type = normalized_type, updated_at = now() where id = document_id_input;
    return normalized_type;
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    select role
    from public.profiles
    where id = auth.uid()
    limit 1
$function$;

CREATE OR REPLACE FUNCTION public.deduct_clearance_after_document_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
    if new.status in ('needs_info', 'approved')
       and coalesce(old.status, '') is distinct from new.status then
        perform public.deduct_clearance_for_processed_track(new.id);
    end if;

    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_clearance_for_processed_track (
  document_id_input uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
    return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_pending_clearance_track (
  track_id_input uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_customer_plan_for_new_track()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    activation public.customer_plan_activations%rowtype;
begin
    update public.customer_plan_activations
    set status = 'expired', updated_at = now()
    where profile_id = new.profile_id
      and status = 'active'
      and expires_at is not null
      and expires_at <= now();

    select *
    into activation
    from public.customer_plan_activations
    where profile_id = new.profile_id
      and status = 'active'
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1
    for update;

    if activation.id is null then
        raise exception 'Your account is currently view-only. A manager must activate a plan before you can create a new clearance.';
    end if;

    if activation.track_limit is not null
       and activation.tracks_used >= activation.track_limit then
        update public.customer_plan_activations
        set status = 'exhausted', updated_at = now()
        where id = activation.id;

        raise exception 'Your current plan has reached its clearance limit. Please renew your plan to create another clearance.';
    end if;

    update public.customer_plan_activations
    set tracks_used = tracks_used + 1,
        status = case
            when track_limit is not null and tracks_used + 1 >= track_limit then 'exhausted'
            else status
        end,
        updated_at = now()
    where id = activation.id;

    new.plan_activation_id := activation.id;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_expired_account_deletions()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
declare
    deleted_count integer;
begin
    with expired as (
        select id from public.profiles where deletion_scheduled_for <= now()
    ), deleted as (
        delete from auth.users users using expired where users.id = expired.id returning users.id
    )
    select count(*) into deleted_count from deleted;
    return deleted_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.grant_manager_free_credits (
  customer_id_input uuid,
  credits_input     integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    target_profile public.profiles%rowtype;
    month_start timestamptz := date_trunc('month', now());
    next_month timestamptz := date_trunc('month', now()) + interval '1 month';
    already_granted integer;
    new_balance integer;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can add free credits.';
    end if;

    if credits_input is null or credits_input < 1 or credits_input > 5 then
        raise exception 'Free credits must be between 1 and 5.';
    end if;

    select *
    into target_profile
    from public.profiles
    where id = customer_id_input
      and role = 'exporter'
    for update;

    if target_profile.id is null then
        raise exception 'Customer profile was not found.';
    end if;

    select coalesce(sum(credits), 0)
    into already_granted
    from public.free_credit_grants
    where profile_id = customer_id_input
      and created_at >= month_start
      and created_at < next_month;

    if already_granted + credits_input > 5 then
        raise exception 'A maximum of 5 free credits can be added per customer per month.';
    end if;

    update public.profiles
    set available_clearances = coalesce(available_clearances, 0) + credits_input
    where id = customer_id_input
    returning available_clearances into new_balance;

    insert into public.free_credit_grants (profile_id, granted_by, credits)
    values (customer_id_input, auth.uid(), credits_input);

    insert into public.credit_transactions (
        profile_id,
        transaction_type,
        credits,
        amount,
        currency,
        description,
        status
    )
    values (
        customer_id_input,
        'adjustment',
        credits_input,
        0,
        'INR',
        'Freebie credits added by manager',
        'completed'
    );

    insert into public.audit_logs (
        actor_id,
        entity_type,
        entity_id,
        action,
        metadata
    )
    values (
        auth.uid(),
        'profile',
        customer_id_input,
        'freebie',
        jsonb_build_object(
            'credits', credits_input,
            'monthly_total', already_granted + credits_input,
            'available_clearances', new_balance,
            'customer_email', target_profile.email
        )
    );

    return jsonb_build_object(
        'available_clearances', new_balance,
        'monthly_total', already_granted + credits_input,
        'monthly_remaining', 5 - already_granted - credits_input
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.grant_manager_plan_credits (
  customer_id_input uuid,
  credits_input     integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    result jsonb;
    activation public.customer_plan_activations%rowtype;
begin
    result := public.grant_manager_free_credits(customer_id_input, credits_input);

    select * into activation
    from public.customer_plan_activations
    where profile_id = customer_id_input
      and plan_type in ('trial', 'standard')
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1
    for update;

    if activation.id is not null then
        update public.customer_plan_activations
        set track_limit = track_limit + credits_input,
            status = 'active',
            updated_at = now()
        where id = activation.id;
    end if;

    return result || jsonb_build_object('plan_activation_id', activation.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    requested_role text := coalesce(new.raw_user_meta_data->>'role', 'exporter');
    normalized_iec text := upper(
        regexp_replace(
            coalesce(new.raw_user_meta_data->>'iec_code', ''),
            '[^A-Za-z0-9]',
            '',
            'g'
        )
    );
    registry_inserted text;
begin
    if requested_role = 'exporter' then
        if normalized_iec !~ '^[A-Z0-9]{10}$' then
            raise exception 'A valid 10-character IEC code is required.';
        end if;

        insert into public.exporter_iec_registry (
            iec_code,
            first_user_id,
            introductory_clearances_granted
        )
        values (
            normalized_iec,
            new.id,
            2
        )
        on conflict (iec_code) do nothing
        returning iec_code into registry_inserted;

        if registry_inserted is null then
            raise exception 'This IEC code has already been registered.';
        end if;
    else
        normalized_iec := null;
    end if;

    insert into public.profiles (
        id,
        email,
        first_name,
        last_name,
        company_name,
        iec_code,
        mobile_number,
        address,
        gstin,
        pan,
        role,
        available_clearances
    )
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'first_name', ''),
        coalesce(new.raw_user_meta_data->>'last_name', ''),
        coalesce(new.raw_user_meta_data->>'company_name', ''),
        normalized_iec,
        coalesce(new.raw_user_meta_data->>'mobile_number', ''),
        coalesce(new.raw_user_meta_data->>'address', ''),
        coalesce(new.raw_user_meta_data->>'gstin', ''),
        coalesce(new.raw_user_meta_data->>'pan', ''),
        requested_role,
        case when requested_role = 'exporter' then 2 else 0 end
    );

    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  -- This safety block executes ONLY when the email shifts to verified
  IF NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.profiles (id, first_name, last_name, company_name, role, email)
    VALUES (
      NEW.id,
      -- Extract every text value precisely matching the state payload keys in your React SignUp form
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
      'exporter',  -- Hardcodes the application role requested for your users
      NEW.email    -- Safely reads the validated email directly from the auth core table
    )
    -- Crucial: If a duplicate event fires on quick double-clicks, update the missing fields instead of throwing an error
    ON CONFLICT (id) DO UPDATE 
    SET 
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      company_name = EXCLUDED.company_name,
      role = EXCLUDED.role,
      email = EXCLUDED.email;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_internal_user()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    select coalesce(public.current_user_role() in ('verifier', 'manager', 'admin'), false)
$function$;

CREATE OR REPLACE FUNCTION public.is_manager_user()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    select coalesce(public.current_user_role() in ('manager', 'admin'), false)
$function$;

CREATE OR REPLACE FUNCTION public.manager_request_customer_account_deletion (
  customer_id_input uuid
)
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    scheduled_at timestamptz := now() + interval '14 days';
    customer_iec text;
begin
    if not public.is_manager_user() then
        raise exception 'Only managers can schedule customer account deletion.';
    end if;

    select iec_code into customer_iec
    from public.profiles
    where id = customer_id_input and role = 'exporter';
    if not found then raise exception 'Exporter account not found.'; end if;

    update public.profiles
    set deletion_requested_at = now(), deletion_scheduled_for = scheduled_at, updated_at = now()
    where id = customer_id_input;

    if customer_iec is not null and customer_iec <> '' then
        update public.exporter_iec_registry
        set retained_until = greatest(coalesce(retained_until, now()), now() + interval '1 year')
        where iec_code = customer_iec;
    end if;

    return scheduled_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_set_customer_status (
  customer_id_input uuid,
  status_input      text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
    if not public.is_manager_user() then raise exception 'Only managers can change account status.'; end if;
    if status_input not in ('active', 'inactive') then raise exception 'Invalid account status.'; end if;
    update public.profiles set account_status = status_input, updated_at = now() where id = customer_id_input and role = 'exporter';
    if not found then raise exception 'Exporter account not found.'; end if;
    return status_input;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_update_customer_profile (
  customer_id_input uuid,
  profile_input     jsonb
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare updated_profile public.profiles%rowtype;
begin
    if not public.is_manager_user() then raise exception 'Only managers can edit customer profiles.'; end if;
    update public.profiles set
        first_name = nullif(btrim(profile_input->>'first_name'), ''),
        last_name = nullif(btrim(profile_input->>'last_name'), ''),
        company_name = nullif(btrim(profile_input->>'company_name'), ''),
        mobile_number = nullif(btrim(profile_input->>'mobile_number'), ''),
        address = nullif(btrim(profile_input->>'address'), ''),
        gstin = upper(nullif(btrim(profile_input->>'gstin'), '')),
        pan = upper(nullif(btrim(profile_input->>'pan'), '')),
        iec_code = upper(nullif(btrim(profile_input->>'iec_code'), '')),
        updated_at = now()
    where id = customer_id_input and role = 'exporter'
    returning * into updated_profile;
    if updated_profile.id is null then raise exception 'Exporter account not found.'; end if;
    return updated_profile;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_business_plan_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
    if new.plan_type = 'business' then
        new.track_limit := 25;
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_iec_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare registered_user_id uuid;
begin
    if tg_op = 'UPDATE' and old.iec_code is not null and old.iec_code <> '' and new.iec_code is distinct from old.iec_code and not public.is_manager_user() then
        raise exception 'IEC code cannot be changed after registration.';
    end if;
    if new.iec_code is not null and new.iec_code <> '' then
        new.iec_code := upper(regexp_replace(new.iec_code, '[^A-Za-z0-9]', '', 'g'));
        if new.iec_code !~ '^[A-Z0-9]{10}$' then raise exception 'IEC code must contain exactly 10 letters or numbers.'; end if;
        select first_user_id into registered_user_id from public.exporter_iec_registry where iec_code = new.iec_code;
        if registered_user_id is not null and registered_user_id <> new.id then raise exception 'This IEC code has already been registered.'; end if;
        insert into public.exporter_iec_registry(iec_code, first_user_id, introductory_clearances_granted) values (new.iec_code, new.id, 1) on conflict (iec_code) do nothing;
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.provision_exporter_trial_plan()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
    if new.role = 'exporter' then
        insert into public.customer_plan_activations(profile_id, plan_type, status, starts_at, expires_at, track_limit, tracks_used, payment_method, notes)
        values (new.id, 'trial', 'active', now(), now() + interval '14 days', 1, 0, 'complimentary', 'Automatically activated one-time 14-day exporter trial.')
        on conflict do nothing;
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_own_account_deletion()
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    scheduled_at timestamptz := now() + interval '14 days';
    customer_iec text;
begin
    select iec_code into customer_iec from public.profiles where id = auth.uid();
    if not found then raise exception 'Account profile not found.'; end if;

    update public.profiles
    set deletion_requested_at = now(), deletion_scheduled_for = scheduled_at, updated_at = now()
    where id = auth.uid();

    if customer_iec is not null and customer_iec <> '' then
        update public.exporter_iec_registry
        set retained_until = greatest(coalesce(retained_until, now()), now() + interval '1 year')
        where iec_code = customer_iec;
    end if;
    return scheduled_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_own_pending_account()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    scheduled_at timestamptz;
begin
    select deletion_scheduled_for into scheduled_at from public.profiles where id = auth.uid();
    if scheduled_at is null then return false; end if;
    if scheduled_at <= now() then raise exception 'The account restoration period has ended.'; end if;
    update public.profiles set deletion_requested_at = null, deletion_scheduled_for = null, updated_at = now() where id = auth.uid();
    return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_verified_auth_email_to_profile()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
    if new.email is distinct from old.email and new.email_confirmed_at is not null then
        update public.profiles
        set email = lower(new.email), updated_at = now()
        where id = new.id;
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_clearance_tracks_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_customer_plan_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_document_review_status (
  document_id_input uuid,
  status_input      text,
  reason_input      text DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    target_document public.documents%rowtype;
    normalized_status text := btrim(coalesce(status_input, ''));
begin
    if normalized_status not in ('needs_info', 'approved', 'clearance_issue') then
        raise exception 'Invalid review status.';
    end if;

    select * into target_document from public.documents where id = document_id_input for update;
    if target_document.id is null then
        raise exception 'Document not found.';
    end if;

    if not public.is_manager_user()
       and not (public.current_user_role() = 'verifier' and target_document.assigned_verifier_id = auth.uid()) then
        raise exception 'You are not allowed to review this document.';
    end if;

    update public.documents
    set status = normalized_status,
        approved_at = case when normalized_status = 'approved' then now() else null end,
        escalated_to_manager = case when public.is_manager_user() then false else escalated_to_manager end,
        escalation_reason = case when public.is_manager_user() then null else escalation_reason end,
        escalated_at = case when public.is_manager_user() then null else escalated_at end,
        updated_at = now()
    where id = document_id_input;

    insert into public.document_status_history(document_id, changed_by, old_status, new_status, reason)
    values (document_id_input, auth.uid(), target_document.status, normalized_status, nullif(btrim(coalesce(reason_input, '')), ''));

    return normalized_status;
end;
$function$;

ALTER TABLE "public"."clearance_transactions"
  ADD CONSTRAINT "clearance_transactions_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE "public"."document_assignments"
  ADD CONSTRAINT "document_assignments_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE "public"."document_comments"
  ADD CONSTRAINT "document_comments_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE "public"."document_formatted_versions"
  ADD CONSTRAINT "document_formatted_versions_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE "public"."document_status_history"
  ADD CONSTRAINT "document_status_history_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE "public"."audit_logs"
  ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."clearance_tracks"
  ADD CONSTRAINT "clearance_tracks_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."clearance_transactions"
  ADD CONSTRAINT "clearance_transactions_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."credit_transactions"
  ADD CONSTRAINT "credit_transactions_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."customer_issues"
  ADD CONSTRAINT "customer_issues_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."document_assignments"
  ADD CONSTRAINT "document_assignments_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."document_assignments"
  ADD CONSTRAINT "document_assignments_assigned_from_fkey" FOREIGN KEY (assigned_from) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."document_assignments"
  ADD CONSTRAINT "document_assignments_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."document_comments"
  ADD CONSTRAINT "document_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."document_status_history"
  ADD CONSTRAINT "document_status_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_assigned_manager_id_fkey" FOREIGN KEY (assigned_manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_assigned_verifier_id_fkey" FOREIGN KEY (assigned_verifier_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."free_credit_grants"
  ADD CONSTRAINT "free_credit_grants_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."free_credit_grants"
  ADD CONSTRAINT "free_credit_grants_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs USING btree (actor_id);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);

CREATE INDEX clearance_transactions_profile_id_idx ON public.clearance_transactions USING btree (profile_id);

CREATE INDEX credit_transactions_profile_created_idx ON public.credit_transactions USING btree (profile_id, created_at DESC);

CREATE INDEX customer_invoices_profile_created_idx ON public.customer_invoices USING btree (profile_id, created_at DESC);

CREATE INDEX customer_issues_created_at_idx ON public.customer_issues USING btree (created_at DESC);

CREATE UNIQUE INDEX customer_plan_one_active_idx ON public.customer_plan_activations USING btree (profile_id)
  WHERE (status = 'active'::text);

CREATE UNIQUE INDEX customer_plan_payment_reference_key ON public.customer_plan_activations USING btree (upper(payment_reference))
  WHERE ((payment_reference IS NOT NULL) AND (TRIM(BOTH FROM payment_reference) <> ''::text));

CREATE INDEX customer_plan_profile_created_idx ON public.customer_plan_activations USING btree (profile_id, created_at DESC);

CREATE INDEX document_assignments_document_id_idx ON public.document_assignments USING btree (document_id);

CREATE INDEX document_comments_document_id_idx ON public.document_comments USING btree (document_id);

CREATE INDEX document_formatted_versions_document_created_idx ON public.document_formatted_versions USING btree (document_id, created_at DESC);

CREATE INDEX document_status_history_document_id_idx ON public.document_status_history USING btree (document_id);

CREATE INDEX documents_assigned_manager_id_idx ON public.documents USING btree (assigned_manager_id);

CREATE INDEX documents_assigned_verifier_id_idx ON public.documents USING btree (assigned_verifier_id);

CREATE INDEX documents_escalated_to_manager_idx ON public.documents USING btree (escalated_to_manager);

CREATE INDEX documents_profile_id_idx ON public.documents USING btree (profile_id);

CREATE INDEX documents_status_idx ON public.documents USING btree (status);

CREATE INDEX free_credit_grants_profile_created_idx ON public.free_credit_grants USING btree (profile_id, created_at DESC);

CREATE INDEX idx_clearance_tracks_profile_id ON public.clearance_tracks USING btree (profile_id);

CREATE INDEX payments_profile_id_idx ON public.payments USING btree (profile_id);

CREATE UNIQUE INDEX profiles_id_key ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_iec_code_key ON public.profiles USING btree (iec_code)
  WHERE ((iec_code IS NOT NULL) AND (iec_code <> ''::text));

CREATE INDEX sales_leads_created_at_idx ON public.sales_leads USING btree (created_at DESC);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_verified
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (((old.email_confirmed_at IS NULL) AND (new.email_confirmed_at IS NOT NULL)))
  EXECUTE FUNCTION public.handle_new_user_profile();

CREATE TRIGGER sync_verified_auth_email_to_profile
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_verified_auth_email_to_profile();

CREATE TRIGGER enforce_customer_plan_for_new_track
  BEFORE INSERT ON public.clearance_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_plan_for_new_track();

CREATE TRIGGER touch_clearance_tracks_updated_at
  BEFORE UPDATE ON public.clearance_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clearance_tracks_updated_at();

CREATE TRIGGER normalize_business_plan_limit
  BEFORE INSERT OR UPDATE OF plan_type, track_limit ON public.customer_plan_activations
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_business_plan_limit();

CREATE TRIGGER touch_customer_plan_updated_at
  BEFORE UPDATE ON public.customer_plan_activations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_customer_plan_updated_at();

CREATE TRIGGER before_document_auto_assign_verifier
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_document_to_verifier();

CREATE TRIGGER protect_profile_iec
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_iec_change();

CREATE TRIGGER provision_exporter_trial_plan
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_exporter_trial_plan();

CREATE POLICY "Managers can read audit logs" ON "public"."audit_logs"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Users can read their own audit logs" ON "public"."audit_logs"
  FOR SELECT
  TO "authenticated"
  USING ((actor_id = auth.uid()));

CREATE POLICY "Managers can read all clearance tracks" ON "public"."clearance_tracks"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "exporters can create own clearance tracks" ON "public"."clearance_tracks"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY "exporters can read own clearance tracks" ON "public"."clearance_tracks"
  FOR SELECT
  TO "authenticated"
  USING ((profile_id = auth.uid()));

CREATE POLICY "exporters can update own clearance tracks" ON "public"."clearance_tracks"
  FOR UPDATE
  TO "authenticated"
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY "Users can read their own clearance transactions" ON "public"."clearance_transactions"
  FOR SELECT
  TO "authenticated"
  USING ((profile_id = auth.uid()));

CREATE POLICY "Users can read their own credit transactions" ON "public"."credit_transactions"
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = profile_id) OR public.is_manager_user()));

CREATE POLICY "Customers and managers can read invoices" ON "public"."customer_invoices"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = auth.uid()) OR public.is_manager_user()));

CREATE POLICY "Managers can add invoices" ON "public"."customer_invoices"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_manager_user() AND (uploaded_by = auth.uid())));

CREATE POLICY "Exporters can report own issues" ON "public"."customer_issues"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((profile_id = auth.uid()) AND (status = 'new'::text) AND (viewed_at IS NULL)));

CREATE POLICY "Managers can mark customer issues viewed" ON "public"."customer_issues"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_manager_user())
  WITH CHECK (public.is_manager_user());

CREATE POLICY "Managers can read customer issues" ON "public"."customer_issues"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Customers and managers can read plan activations" ON "public"."customer_plan_activations"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = auth.uid()) OR public.is_manager_user()));

CREATE POLICY "Users can comment on their own documents" ON "public"."document_comments"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_comments.document_id) AND (d.profile_id = auth.uid()))))));

CREATE POLICY "Users can read visible comments on own documents" ON "public"."document_comments"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_comments.document_id) AND (d.profile_id = auth.uid())))) AND (is_internal = false)));

CREATE POLICY "Verifiers can comment on assigned documents simple" ON "public"."document_comments"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_comments.document_id) AND (d.assigned_verifier_id = auth.uid()))))));

CREATE POLICY "Verifiers can read comments on assigned documents simple" ON "public"."document_comments"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_comments.document_id) AND (d.assigned_verifier_id = auth.uid())))));

CREATE POLICY "Reviewers can add formatted versions" ON "public"."document_formatted_versions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_formatted_versions.document_id) AND ((d.assigned_verifier_id = auth.uid()) OR public.is_manager_user()))))));

CREATE POLICY "Visible users can read formatted versions" ON "public"."document_formatted_versions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_formatted_versions.document_id) AND ((d.profile_id = auth.uid()) OR (d.assigned_verifier_id = auth.uid()) OR public.is_manager_user())))));

CREATE POLICY "Exporters can insert own status history" ON "public"."document_status_history"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((changed_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_status_history.document_id) AND (d.profile_id = auth.uid()))))));

CREATE POLICY "Exporters can read own document status history simple" ON "public"."document_status_history"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_status_history.document_id) AND (d.profile_id = auth.uid())))));

CREATE POLICY "Managers can insert status history simple" ON "public"."document_status_history"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((changed_by = auth.uid()) AND public.is_manager_user()));

CREATE POLICY "Managers can read all status history simple" ON "public"."document_status_history"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Verifiers can insert assigned status history simple" ON "public"."document_status_history"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((changed_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_status_history.document_id) AND (d.assigned_verifier_id = auth.uid()))))));

CREATE POLICY "Verifiers can read assigned status history simple" ON "public"."document_status_history"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_status_history.document_id) AND (d.assigned_verifier_id = auth.uid())))));

CREATE POLICY "Exporters can delete unlocked own documents" ON "public"."documents"
  FOR DELETE
  TO "authenticated"
  USING (((profile_id = auth.uid()) AND (status <> ALL (ARRAY['needs_info'::text, 'approved'::text, 'clearance_issue'::text]))));

CREATE POLICY "Exporters can insert their own documents" ON "public"."documents"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY "Exporters can mark own documents clearance issue" ON "public"."documents"
  FOR UPDATE
  TO "authenticated"
  USING (((profile_id = auth.uid()) AND (status = 'approved'::text)))
  WITH CHECK (((profile_id = auth.uid()) AND (status = 'clearance_issue'::text)));

CREATE POLICY "Exporters can read their own documents" ON "public"."documents"
  FOR SELECT
  TO "authenticated"
  USING ((profile_id = auth.uid()));

CREATE POLICY "Exporters can update their own documents" ON "public"."documents"
  FOR UPDATE
  TO "authenticated"
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY "Managers can read all documents" ON "public"."documents"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Verifiers can read assigned documents simple" ON "public"."documents"
  FOR SELECT
  TO "authenticated"
  USING ((assigned_verifier_id = auth.uid()));

CREATE POLICY "Verifiers can update assigned documents simple" ON "public"."documents"
  FOR UPDATE
  TO "authenticated"
  USING ((assigned_verifier_id = auth.uid()))
  WITH CHECK ((assigned_verifier_id = auth.uid()));

CREATE POLICY "Managers can read free credit grants" ON "public"."free_credit_grants"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Users can read their own payments" ON "public"."payments"
  FOR SELECT
  TO "authenticated"
  USING ((profile_id = auth.uid()));

CREATE POLICY "Managers can read all profiles" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Users can insert own profile simple" ON "public"."profiles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can insert their own profile" ON "public"."profiles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can read own profile simple" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = id));

CREATE POLICY "Users can update own profile simple" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update their own profile" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Managers can mark sales inquiries viewed" ON "public"."sales_leads"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_manager_user())
  WITH CHECK (public.is_manager_user());

CREATE POLICY "Managers can read sales inquiries" ON "public"."sales_leads"
  FOR SELECT
  TO "authenticated"
  USING (public.is_manager_user());

CREATE POLICY "Visitors can submit sales inquiries" ON "public"."sales_leads"
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (((status = 'new'::text) AND (viewed_at IS NULL)));

CREATE POLICY "Customers can read invoice files" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM public.customer_invoices invoice
  WHERE ((invoice.storage_path = objects.name) AND ((invoice.profile_id = auth.uid()) OR public.is_manager_user()))))));

CREATE POLICY "Internal users can upload formatted files" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((bucket_id = 'documents'::text) AND public.is_internal_user() AND (split_part(name, '/'::text, 1) = 'formatted'::text) AND (split_part(name, '/'::text, 2) =
    (auth.uid())::text)));

CREATE POLICY "Managers can read all document files" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND public.is_manager_user()));

CREATE POLICY "Managers can upload invoice files" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'documents'::text) AND public.is_manager_user() AND (split_part(name, '/'::text, 1) = 'invoices'::text)));

CREATE POLICY "Owners can read formatted files" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM (public.document_formatted_versions VERSION
     JOIN public.documents d ON ((d.id = version.document_id)))
  WHERE ((version.storage_path = objects.name) AND (d.profile_id = auth.uid()))))));

CREATE POLICY "Users can delete their own uploaded documents" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can read their own uploaded documents" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can update their own uploaded documents" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))
  WITH CHECK (((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can upload their own documents" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Verifiers can read assigned document files simple" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.storage_path = objects.name) AND (d.assigned_verifier_id = auth.uid()))))));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."customer_issues";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."sales_leads";

COMMENT ON COLUMN "public"."profiles"."address" IS 'Exporter registered or business address captured from edit profile.';

COMMENT ON COLUMN "public"."profiles"."gstin" IS 'Exporter GSTIN captured from edit profile.';

COMMENT ON COLUMN "public"."profiles"."pan" IS 'Exporter PAN captured from edit profile.';

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

COMMENT ON EXTENSION "pg_net" IS 'Async HTTP';

COMMENT ON TABLE "public"."exporter_iec_registry" IS 'Permanent IEC redemption registry. Rows must survive deletion of the related auth user and profile.';

REVOKE ALL ON FUNCTION "public"."activate_customer_plan"(uuid, text, numeric, text, date, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."activate_customer_plan"(uuid, text, numeric, text, date, text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."activate_customer_plan"(uuid, text, numeric, text, date, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."activate_customer_plan"(uuid, text, numeric, text, date, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."activate_customer_plan"(uuid, text, numeric, text, date, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."assign_document_to_verifier"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."assign_document_to_verifier"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_document_to_verifier"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_document_to_verifier"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."classify_document_type"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."classify_document_type"(uuid, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."classify_document_type"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."classify_document_type"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."classify_document_type"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."deduct_clearance_after_document_status_change"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."deduct_clearance_after_document_status_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_clearance_after_document_status_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_clearance_after_document_status_change"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."deduct_clearance_for_processed_track"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."deduct_clearance_for_processed_track"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_clearance_for_processed_track"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_clearance_for_processed_track"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_pending_clearance_track"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."delete_pending_clearance_track"(uuid) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_pending_clearance_track"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_pending_clearance_track"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_pending_clearance_track"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."enforce_customer_plan_for_new_track"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."enforce_customer_plan_for_new_track"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_customer_plan_for_new_track"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_customer_plan_for_new_track"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."finalize_expired_account_deletions"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."finalize_expired_account_deletions"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."finalize_expired_account_deletions"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."finalize_expired_account_deletions"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."finalize_expired_account_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."grant_manager_free_credits"(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."grant_manager_free_credits"(uuid, integer) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."grant_manager_free_credits"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_manager_free_credits"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_manager_free_credits"(uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."grant_manager_plan_credits"(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."grant_manager_plan_credits"(uuid, integer) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."grant_manager_plan_credits"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_manager_plan_credits"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_manager_plan_credits"(uuid, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user_profile"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user_profile"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user_profile"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_internal_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_internal_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_internal_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_internal_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_manager_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_manager_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_manager_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_manager_user"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."manager_request_customer_account_deletion"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."manager_request_customer_account_deletion"(uuid) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."manager_request_customer_account_deletion"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_request_customer_account_deletion"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_request_customer_account_deletion"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."manager_set_customer_status"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."manager_set_customer_status"(uuid, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."manager_set_customer_status"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_set_customer_status"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_set_customer_status"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."manager_update_customer_profile"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."manager_update_customer_profile"(uuid, jsonb) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."manager_update_customer_profile"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_update_customer_profile"(uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_update_customer_profile"(uuid, jsonb) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."normalize_business_plan_limit"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."normalize_business_plan_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_business_plan_limit"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_business_plan_limit"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."prevent_profile_iec_change"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."prevent_profile_iec_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_profile_iec_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_profile_iec_change"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."provision_exporter_trial_plan"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."provision_exporter_trial_plan"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."provision_exporter_trial_plan"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."provision_exporter_trial_plan"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."request_own_account_deletion"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."request_own_account_deletion"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."request_own_account_deletion"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_own_account_deletion"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_own_account_deletion"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."restore_own_pending_account"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."restore_own_pending_account"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."restore_own_pending_account"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."restore_own_pending_account"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."restore_own_pending_account"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."sync_verified_auth_email_to_profile"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."sync_verified_auth_email_to_profile"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_verified_auth_email_to_profile"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_verified_auth_email_to_profile"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."touch_clearance_tracks_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."touch_clearance_tracks_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_clearance_tracks_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_clearance_tracks_updated_at"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."touch_customer_plan_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."touch_customer_plan_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_customer_plan_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_customer_plan_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_document_review_status"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_document_review_status"(uuid, text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."update_document_review_status"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_document_review_status"(uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_document_review_status"(uuid, text, text) TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."audit_logs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clearance_tracks" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."clearance_tracks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clearance_tracks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clearance_tracks" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clearance_transactions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."clearance_transactions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clearance_transactions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clearance_transactions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."credit_transactions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."credit_transactions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."credit_transactions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."credit_transactions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_invoices" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."customer_invoices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_invoices" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_invoices" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_issues" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."customer_issues" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_issues" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_issues" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_plan_activations" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."customer_plan_activations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_plan_activations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_plan_activations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_assignments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."document_assignments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_assignments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_assignments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_comments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."document_comments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_comments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_comments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_formatted_versions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."document_formatted_versions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_formatted_versions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_formatted_versions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_status_history" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."document_status_history" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_status_history" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."document_status_history" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."documents" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "service_role";

REVOKE ALL ON TABLE "public"."exporter_iec_registry" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exporter_iec_registry" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exporter_iec_registry" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."free_credit_grants" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."free_credit_grants" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."free_credit_grants" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."free_credit_grants" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."payments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales_leads" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sales_leads" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales_leads" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales_leads" TO "service_role";

SELECT cron.schedule_in_database('finalize-expired-account-deletions', '30 2 * * *', 'select public.finalize_expired_account_deletions();', 'postgres', NULL, true);

