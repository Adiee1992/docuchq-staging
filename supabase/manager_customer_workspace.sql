alter table public.profiles add column if not exists account_status text not null default 'active' check (account_status in ('active', 'inactive'));

create or replace function public.prevent_profile_iec_change()
returns trigger language plpgsql set search_path = public
as $function$
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

create table if not exists public.customer_invoices (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null,
    invoice_number text not null,
    storage_bucket text not null default 'documents',
    storage_path text not null unique,
    file_name text not null,
    file_size bigint not null,
    mime_type text not null default 'application/pdf',
    uploaded_by uuid not null,
    created_at timestamptz not null default now()
);
create index if not exists customer_invoices_profile_created_idx on public.customer_invoices(profile_id, created_at desc);
alter table public.customer_invoices enable row level security;
grant select, insert on public.customer_invoices to authenticated;
create policy "Customers and managers can read invoices" on public.customer_invoices for select to authenticated using (profile_id = auth.uid() or public.is_manager_user());
create policy "Managers can add invoices" on public.customer_invoices for insert to authenticated with check (public.is_manager_user() and uploaded_by = auth.uid());
create policy "Managers can upload invoice files" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.is_manager_user() and split_part(name, '/', 1) = 'invoices');
create policy "Customers can read invoice files" on storage.objects for select to authenticated using (
    bucket_id = 'documents' and exists (select 1 from public.customer_invoices invoice where invoice.storage_path = storage.objects.name and (invoice.profile_id = auth.uid() or public.is_manager_user()))
);

create or replace function public.manager_update_customer_profile(customer_id_input uuid, profile_input jsonb)
returns public.profiles
language plpgsql security definer set search_path = public
as $function$
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

create or replace function public.manager_set_customer_status(customer_id_input uuid, status_input text)
returns text language plpgsql security definer set search_path = public
as $function$
begin
    if not public.is_manager_user() then raise exception 'Only managers can change account status.'; end if;
    if status_input not in ('active', 'inactive') then raise exception 'Invalid account status.'; end if;
    update public.profiles set account_status = status_input, updated_at = now() where id = customer_id_input and role = 'exporter';
    if not found then raise exception 'Exporter account not found.'; end if;
    return status_input;
end;
$function$;

revoke all on function public.manager_update_customer_profile(uuid, jsonb) from public;
revoke all on function public.manager_set_customer_status(uuid, text) from public;
grant execute on function public.manager_update_customer_profile(uuid, jsonb) to authenticated;
grant execute on function public.manager_set_customer_status(uuid, text) to authenticated;
notify pgrst, 'reload schema';
