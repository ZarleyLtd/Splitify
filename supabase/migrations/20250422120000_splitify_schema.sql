-- Splitify: bills, line items, claims, config, temporary upload jobs
-- Service role (Edge Functions) bypasses RLS; direct DB access from clients is denied.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.bills (
  bill_id text primary key,
  bill_date date not null,
  venue_name text not null default '',
  open boolean not null default true,
  total_paid numeric,
  image_path text,
  image_mime text,
  created_at timestamptz not null default now()
);

create index bills_created_at_desc_idx on public.bills (created_at desc);

create table public.bill_items (
  id bigserial primary key,
  bill_id text not null references public.bills (bill_id) on delete cascade,
  row_index integer not null,
  category text not null default 'other',
  description text not null default '',
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  total_price numeric not null default 0,
  unique (bill_id, row_index)
);

create index bill_items_bill_id_idx on public.bill_items (bill_id);

create table public.claims (
  id bigserial primary key,
  bill_id text not null references public.bills (bill_id) on delete cascade,
  user_name text not null,
  row_index integer not null,
  unit_index integer not null,
  created_at timestamptz not null default now(),
  unique (bill_id, row_index, unit_index)
);

create index claims_bill_id_idx on public.claims (bill_id);

create table public.config_entries (
  key text primary key,
  value text not null default ''
);

-- Gemini analyze step: short-lived job payload (replaces Apps Script Properties)
create table public.upload_jobs (
  job_id text primary key,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create index upload_jobs_created_at_idx on public.upload_jobs (created_at);

-- ---------------------------------------------------------------------------
-- RLS: block anonymous/authenticated direct table access
-- ---------------------------------------------------------------------------

alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.claims enable row level security;
alter table public.config_entries enable row level security;
alter table public.upload_jobs enable row level security;

-- No policies: only service_role bypasses RLS

-- ---------------------------------------------------------------------------
-- Storage bucket for bill images (private; Edge Function reads with service role)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('bill-images', 'bill-images', false)
on conflict (id) do nothing;

-- Allow service role full access via bypass; optional: restrict storage policies
-- For PostgREST storage API we deny anon/auth by omitting policies.
