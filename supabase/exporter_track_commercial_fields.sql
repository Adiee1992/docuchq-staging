alter table public.documents
add column if not exists customer_name text;

alter table public.documents
add column if not exists destination_country text;

alter table public.documents
add column if not exists invoice_currency text;

notify pgrst, 'reload schema';
