alter table public.documents
add column if not exists assigned_verifier_id uuid references public.profiles(id) on delete set null;

alter table public.documents
add column if not exists assigned_manager_id uuid references public.profiles(id) on delete set null;

alter table public.documents
add column if not exists assigned_at timestamptz;

alter table public.documents
add column if not exists escalated_to_manager boolean not null default false;

alter table public.documents
add column if not exists escalation_reason text;

alter table public.documents
add column if not exists escalated_at timestamptz;

create table if not exists public.document_status_history (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    changed_by uuid references public.profiles(id) on delete set null,
    old_status text,
    new_status text not null,
    reason text,
    created_at timestamptz not null default now()
);

alter table public.document_status_history enable row level security;

notify pgrst, 'reload schema';
