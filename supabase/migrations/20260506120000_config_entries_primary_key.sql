-- PostgREST upsert (ON CONFLICT) requires a unique constraint or primary key on the target column(s).
-- Some projects may have created splitify.config_entries without one; align with the original schema.

do $$
begin
  if to_regclass('splitify.config_entries') is null then
    raise notice 'splitify.config_entries does not exist; skip primary key fix';
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'splitify'
      and t.relname = 'config_entries'
      and c.contype = 'p'
  ) then
    alter table splitify.config_entries add primary key (key);
  end if;
end $$;
