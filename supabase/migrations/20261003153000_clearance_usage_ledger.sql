alter table public.clearance_transactions
    add column if not exists track_id uuid,
    add column if not exists reference_id text,
    add column if not exists plan_activation_id uuid,
    add column if not exists plan_type text,
    add column if not exists balance_before integer,
    add column if not exists actor_id uuid,
    add column if not exists customer_name_snapshot text,
    add column if not exists buyer_name_snapshot text,
    add column if not exists company_name_snapshot text,
    add column if not exists email_snapshot text;

alter table public.clearance_transactions alter column profile_id drop not null;
alter table public.clearance_transactions drop constraint if exists clearance_transactions_profile_id_fkey;
alter table public.clearance_transactions
    add constraint clearance_transactions_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete set null;

create unique index if not exists clearance_transactions_track_event_key
on public.clearance_transactions(track_id, transaction_type)
where track_id is not null;

create index if not exists clearance_transactions_reference_created_idx
on public.clearance_transactions(reference_id, created_at desc);

create or replace function public.record_clearance_usage_after_track_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    activation public.customer_plan_activations%rowtype;
    customer public.profiles%rowtype;
    remaining integer;
begin
    select * into activation
    from public.customer_plan_activations
    where id = new.plan_activation_id;

    select * into customer
    from public.profiles
    where id = new.profile_id;

    remaining := case
        when activation.track_limit is null then null
        else greatest(activation.track_limit - activation.tracks_used, 0)
    end;

    update public.profiles
    set available_clearances = coalesce(remaining, available_clearances), updated_at = now()
    where id = new.profile_id;

    insert into public.clearance_transactions (
        profile_id, track_id, reference_id, plan_activation_id, plan_type,
        transaction_type, amount, balance_before, balance_after, reason,
        actor_id, customer_name_snapshot, buyer_name_snapshot, company_name_snapshot, email_snapshot, created_at
    ) values (
        new.profile_id, new.id, new.reference_id, new.plan_activation_id, activation.plan_type,
        'deduction', -1, case when remaining is null then null else remaining + 1 end, remaining,
        'Clearance created', auth.uid(), nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), ''), new.customer_name, customer.company_name, customer.email, new.created_at
    )
    on conflict (track_id, transaction_type) where track_id is not null do nothing;

    return new;
end;
$function$;

drop trigger if exists record_clearance_usage_after_track_insert on public.clearance_tracks;
create trigger record_clearance_usage_after_track_insert
after insert on public.clearance_tracks
for each row execute function public.record_clearance_usage_after_track_insert();

-- Reconstruct usage for current tracks. Snapshot fields keep these entries useful
-- if the related track or customer is deleted later.
with ranked_tracks as (
    select
        track.*,
        activation.plan_type,
        activation.track_limit,
        row_number() over (partition by track.plan_activation_id order by track.created_at, track.id) as usage_number,
        profile.first_name,
        profile.last_name,
        profile.company_name,
        profile.email
    from public.clearance_tracks track
    left join public.customer_plan_activations activation on activation.id = track.plan_activation_id
    left join public.profiles profile on profile.id = track.profile_id
)
insert into public.clearance_transactions (
    profile_id, track_id, reference_id, plan_activation_id, plan_type,
    transaction_type, amount, balance_before, balance_after, reason,
    actor_id, customer_name_snapshot, buyer_name_snapshot, company_name_snapshot, email_snapshot, created_at
)
select
    profile_id, id, reference_id, plan_activation_id, plan_type,
    'deduction', -1,
    case when track_limit is null then null else greatest(track_limit - usage_number + 1, 0)::integer end,
    case when track_limit is null then null else greatest(track_limit - usage_number, 0)::integer end,
    'Historical clearance usage reconstructed from existing track',
    profile_id, nullif(btrim(concat_ws(' ', first_name, last_name)), ''), customer_name, company_name, email, created_at
from ranked_tracks
on conflict (track_id, transaction_type) where track_id is not null do nothing;

drop policy if exists "Users can read their own clearance transactions" on public.clearance_transactions;
drop policy if exists "Managers can read clearance transactions" on public.clearance_transactions;
create policy "Users can read their own clearance transactions"
on public.clearance_transactions for select to authenticated
using (profile_id = auth.uid());
create policy "Managers can read clearance transactions"
on public.clearance_transactions for select to authenticated
using (public.is_manager_user());

revoke all on public.clearance_transactions from anon, authenticated;
grant select on public.clearance_transactions to authenticated;

notify pgrst, 'reload schema';
