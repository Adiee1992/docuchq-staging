alter table public.profiles
add column if not exists address text,
add column if not exists gstin text,
add column if not exists pan text;

comment on column public.profiles.address is 'Exporter registered or business address captured from edit profile.';
comment on column public.profiles.gstin is 'Exporter GSTIN captured from edit profile.';
comment on column public.profiles.pan is 'Exporter PAN captured from edit profile.';
