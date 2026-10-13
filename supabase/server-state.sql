-- Additive setup for the independent server. Existing catalogue and order data stay in place.
begin;
create table if not exists original_store_private.server_migration_backups(backup_name text primary key,captured_at timestamptz not null default now(),snapshot jsonb not null);
alter table original_store_private.server_migration_backups enable row level security;
revoke all on original_store_private.server_migration_backups from public,anon,authenticated;
grant select on original_store_private.server_migration_backups to service_role;
insert into original_store_private.server_migration_backups(backup_name,snapshot)
select 'original_store_server_20261013',jsonb_build_object('datasets',(select jsonb_agg(public.store_read_dataset(name) order by name) from original_store_private.datasets))
on conflict(backup_name) do nothing;

create table if not exists original_store_private.server_state (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 1,
  properties jsonb not null default '{}'::jsonb,
  cache jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table original_store_private.server_state enable row level security;
revoke all on original_store_private.server_state from public, anon, authenticated;
grant select, update, insert on original_store_private.server_state to service_role;
insert into original_store_private.server_state(singleton,properties)
values(true,'{"BLYXU_ADMIN_EMAILS":"originalstorealmacen@gmail.com"}')
on conflict(singleton) do nothing;

create or replace function public.store_read_server_state() returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$ select jsonb_build_object('revision',revision::text,'properties',properties,'cache',cache)
from original_store_private.server_state where singleton=true $$;

create or replace function public.store_load_server() returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$ select jsonb_build_object(
  'state',public.store_read_server_state(),
  'datasets',(select jsonb_agg(public.store_read_dataset(name) order by name)
    from original_store_private.datasets)
) $$;

create or replace function public.store_commit_server(
  expected_revision bigint, changes jsonb, server_properties jsonb, server_cache jsonb
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare current_revision bigint; result jsonb;
begin
  select revision into current_revision from original_store_private.server_state
  where singleton=true for update;
  if current_revision is distinct from expected_revision then
    raise sqlstate 'PT409' using message='Concurrent server operation';
  end if;
  if jsonb_typeof(server_properties) is distinct from 'object' or jsonb_typeof(server_cache) is distinct from 'object'
     or jsonb_typeof(changes) is distinct from 'array' then
    raise exception 'Invalid server state';
  end if;
  -- Existing dataset revisions validate the snapshot of catalogue/orders too.
  -- Everything rolls back if either the state or any dataset conflicts.
  result := public.store_commit_datasets(changes);
  update original_store_private.server_state set properties=server_properties,cache=server_cache,
  revision=revision+1,updated_at=now() where singleton=true;
  return jsonb_build_object('ok',true,'revision',(current_revision+1)::text,'datasets',result);
end $$;
revoke all on function public.store_read_server_state() from public, anon, authenticated;
revoke all on function public.store_load_server() from public, anon, authenticated;
revoke all on function public.store_commit_server(bigint,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.store_read_server_state() to service_role;
grant execute on function public.store_load_server() to service_role;
grant execute on function public.store_commit_server(bigint,jsonb,jsonb,jsonb) to service_role;
commit;
