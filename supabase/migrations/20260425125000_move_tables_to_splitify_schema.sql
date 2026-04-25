-- Move Splitify app tables from public schema to splitify schema.
-- Safe to run once in environments where tables currently live in public.

create schema if not exists splitify;

do $$
begin
  if to_regclass('public.bills') is not null then
    if to_regclass('splitify.bills') is null then
      execute 'alter table public.bills set schema splitify';
    else
      raise notice 'Skipping move for public.bills because splitify.bills already exists';
    end if;
  end if;

  if to_regclass('public.bill_items') is not null then
    if to_regclass('splitify.bill_items') is null then
      execute 'alter table public.bill_items set schema splitify';
    else
      raise notice 'Skipping move for public.bill_items because splitify.bill_items already exists';
    end if;
  end if;

  if to_regclass('public.claims') is not null then
    if to_regclass('splitify.claims') is null then
      execute 'alter table public.claims set schema splitify';
    else
      raise notice 'Skipping move for public.claims because splitify.claims already exists';
    end if;
  end if;

  if to_regclass('public.config_entries') is not null then
    if to_regclass('splitify.config_entries') is null then
      execute 'alter table public.config_entries set schema splitify';
    else
      raise notice 'Skipping move for public.config_entries because splitify.config_entries already exists';
    end if;
  end if;

  if to_regclass('public.upload_jobs') is not null then
    if to_regclass('splitify.upload_jobs') is null then
      execute 'alter table public.upload_jobs set schema splitify';
    else
      raise notice 'Skipping move for public.upload_jobs because splitify.upload_jobs already exists';
    end if;
  end if;
end
$$;

grant usage on schema splitify to anon, authenticated, service_role;
grant all on all tables in schema splitify to anon, authenticated, service_role;
grant all on all sequences in schema splitify to anon, authenticated, service_role;

alter default privileges for role postgres in schema splitify
grant all on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema splitify
grant all on sequences to anon, authenticated, service_role;
