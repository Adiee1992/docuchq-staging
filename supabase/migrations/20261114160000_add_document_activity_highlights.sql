-- Persistent cross-role unread activity for document comments and status changes.
-- Events begin at migration time, so historical activity does not highlight every file.
create table if not exists public.document_activity_events (
    id bigint generated always as identity primary key,
    document_id uuid not null references public.documents(id) on delete cascade,
    actor_id uuid references public.profiles(id) on delete set null,
    actor_role text not null,
    activity_type text not null check (activity_type in ('comment', 'status')),
    is_internal boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists document_activity_events_document_created_idx
    on public.document_activity_events(document_id, created_at desc);

create table if not exists public.document_activity_reads (
    user_id uuid not null references public.profiles(id) on delete cascade,
    document_id uuid not null references public.documents(id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (user_id, document_id)
);

alter table public.document_activity_events enable row level security;
alter table public.document_activity_reads enable row level security;

create or replace function public.capture_document_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    role_value text;
begin
    select role into role_value from public.profiles where id = new.author_id;
    insert into public.document_activity_events(document_id, actor_id, actor_role, activity_type, is_internal, created_at)
    values (new.document_id, new.author_id, coalesce(role_value, 'exporter'), 'comment', new.is_internal, new.created_at);
    return new;
end;
$function$;

drop trigger if exists capture_document_comment_activity on public.document_comments;
create trigger capture_document_comment_activity
after insert on public.document_comments
for each row execute function public.capture_document_comment_activity();

create or replace function public.capture_document_status_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    role_value text;
begin
    select role into role_value from public.profiles where id = new.changed_by;
    insert into public.document_activity_events(document_id, actor_id, actor_role, activity_type, created_at)
    values (new.document_id, new.changed_by, coalesce(role_value, 'exporter'), 'status', new.created_at);
    return new;
end;
$function$;

drop trigger if exists capture_document_status_activity on public.document_status_history;
create trigger capture_document_status_activity
after insert on public.document_status_history
for each row execute function public.capture_document_status_activity();

create or replace function public.get_unread_document_activity()
returns table(document_id uuid, latest_activity_at timestamptz)
language sql
stable
security definer
set search_path = public
as $function$
    with viewer as (
        select id, role from public.profiles where id = auth.uid()
    )
    select event.document_id, max(event.created_at) as latest_activity_at
    from public.document_activity_events event
    join public.documents document on document.id = event.document_id
    cross join viewer
    left join public.document_activity_reads receipt
        on receipt.user_id = viewer.id and receipt.document_id = event.document_id
    where event.actor_id is distinct from viewer.id
      and event.created_at > coalesce(receipt.last_read_at, '-infinity'::timestamptz)
      and (
          (viewer.role = 'exporter'
              and document.profile_id = viewer.id
              and event.actor_role in ('manager', 'verifier')
              and (event.activity_type = 'status' or event.is_internal = false))
          or
          (viewer.role = 'manager' and event.actor_role = 'exporter')
          or
          (viewer.role = 'verifier'
              and document.assigned_verifier_id = viewer.id
              and event.actor_role = 'exporter')
      )
    group by event.document_id;
$function$;

create or replace function public.mark_document_activity_read(document_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    viewer_role text;
    can_view boolean;
begin
    select role into viewer_role from public.profiles where id = auth.uid();
    select exists (
        select 1 from public.documents document
        where document.id = document_id_input
          and (
              document.profile_id = auth.uid()
              or (viewer_role = 'verifier' and document.assigned_verifier_id = auth.uid())
              or viewer_role = 'manager'
          )
    ) into can_view;

    if not can_view then
        raise exception 'Document is not visible to the current user.';
    end if;

    insert into public.document_activity_reads(user_id, document_id, last_read_at)
    values (auth.uid(), document_id_input, now())
    on conflict (user_id, document_id)
    do update set last_read_at = excluded.last_read_at;
end;
$function$;

revoke all on function public.get_unread_document_activity() from public;
revoke all on function public.mark_document_activity_read(uuid) from public;
grant execute on function public.get_unread_document_activity() to authenticated;
grant execute on function public.mark_document_activity_read(uuid) to authenticated;

notify pgrst, 'reload schema';
