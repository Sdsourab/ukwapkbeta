-- Universal Knowledge Workspace: cloud sync schema for YOUR OWN Supabase project.
-- Run this once in the project's SQL editor. It is idempotent (safe to re-run).
--
-- Security model
--   * Every row belongs to one user (user_id = auth.uid()). Row-level security is ON and is the only
--     thing separating users, so never disable it and never ship the service-role key in a client.
--   * The browser/extension only ever uses the public anon key + the signed-in user's JWT.
--   * Pushes are serialised per user with an advisory lock so server_seq order == commit order
--     (otherwise a puller could advance its cursor past a row that commits later).
--
-- Semantics are identical to MemoryTransport in packages/sync-engine (the tested reference):
--   * optimistic concurrency: a write is accepted only if base_seq equals the row's current server_seq
--   * idempotency: replaying an op_id returns the original answer and changes nothing
--   * server_seq is assigned by the server and increases on every accepted write

create table if not exists public.ukw_records (
  user_id     uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  entity_type text    not null,
  id          text    not null,
  rev         integer not null,
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  payload     jsonb,
  device_id   text,
  server_seq  bigint  not null,
  primary key (user_id, entity_type, id),
  constraint ukw_records_entity_type_check check (entity_type in (
    'documents','annotations','notes','tags','taggings','collections','collectionItems',
    'graphs','nodes','edges','researchProjects','references','matrices','tasks','readingProgress'
  )),
  constraint ukw_records_payload_size check (payload is null or pg_column_size(payload) <= 1048576)
);

create index if not exists ukw_records_pull_idx on public.ukw_records (user_id, server_seq);

create table if not exists public.ukw_ops (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  op_id      text not null,
  result     jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, op_id)
);
create index if not exists ukw_ops_age_idx on public.ukw_ops (created_at);

create table if not exists public.ukw_counters (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  seq     bigint not null default 0
);

alter table public.ukw_records  enable row level security;
alter table public.ukw_ops      enable row level security;
alter table public.ukw_counters enable row level security;

drop policy if exists ukw_records_own  on public.ukw_records;
drop policy if exists ukw_ops_own      on public.ukw_ops;
drop policy if exists ukw_counters_own on public.ukw_counters;
create policy ukw_records_own  on public.ukw_records  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ukw_ops_own      on public.ukw_ops      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ukw_counters_own on public.ukw_counters for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Anonymous visitors get nothing.
revoke all on public.ukw_records, public.ukw_ops, public.ukw_counters from anon;

create or replace function public.ukw_push(ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  op       jsonb;
  prev     jsonb;
  cur      public.ukw_records%rowtype;
  new_seq  bigint;
  rec      jsonb;
  res      jsonb;
  results  jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(ops) <> 'array' or jsonb_array_length(ops) > 500 then
    raise exception 'ops must be an array of at most 500 operations' using errcode = '22023';
  end if;

  -- One writer per user at a time: server_seq order then equals commit order.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  insert into public.ukw_counters (user_id) values (uid) on conflict (user_id) do nothing;

  for op in select value from jsonb_array_elements(ops) loop
    select result into prev from public.ukw_ops where user_id = uid and op_id = op ->> 'op_id';
    if found then
      results := results || jsonb_build_array(prev);   -- idempotent replay
      continue;
    end if;

    select * into cur from public.ukw_records
      where user_id = uid and entity_type = op ->> 'entity_type' and id = op ->> 'id';

    if found and cur.server_seq <> coalesce((op ->> 'base_seq')::bigint, 0) then
      res := jsonb_build_object(
        'op_id', op ->> 'op_id', 'status', 'conflict',
        'record', to_jsonb(cur) - 'user_id');
    elsif (op ->> 'entity_type') not in (
        'documents','annotations','notes','tags','taggings','collections','collectionItems',
        'graphs','nodes','edges','researchProjects','references','matrices','tasks','readingProgress') then
      res := jsonb_build_object('op_id', op ->> 'op_id', 'status', 'rejected', 'error', 'unknown entity type');
    elsif (op -> 'payload') is not null and jsonb_typeof(op -> 'payload') <> 'null' and pg_column_size(op -> 'payload') > 1048576 then
      res := jsonb_build_object('op_id', op ->> 'op_id', 'status', 'rejected', 'error', 'payload too large');
    else
      update public.ukw_counters set seq = seq + 1 where user_id = uid returning seq into new_seq;
      insert into public.ukw_records as r (user_id, entity_type, id, rev, updated_at, deleted, payload, device_id, server_seq)
      values (
        uid, op ->> 'entity_type', op ->> 'id', (op ->> 'rev')::integer, (op ->> 'updated_at')::timestamptz,
        coalesce((op ->> 'deleted')::boolean, false),
        case when jsonb_typeof(op -> 'payload') = 'null' then null else op -> 'payload' end,
        op ->> 'device_id', new_seq)
      on conflict (user_id, entity_type, id) do update set
        rev = excluded.rev, updated_at = excluded.updated_at, deleted = excluded.deleted,
        payload = excluded.payload, device_id = excluded.device_id, server_seq = excluded.server_seq
      returning to_jsonb(r) - 'user_id' into rec;
      res := jsonb_build_object('op_id', op ->> 'op_id', 'status', 'ok', 'record', rec);
    end if;

    insert into public.ukw_ops (user_id, op_id, result) values (uid, op ->> 'op_id', res);
    results := results || jsonb_build_array(res);
  end loop;

  return results;
end;
$$;

create or replace function public.ukw_pull(since bigint, lim integer)
returns setof public.ukw_records
language sql
security invoker
stable
set search_path = public
as $$
  select * from public.ukw_records
  where user_id = auth.uid() and server_seq > since
  order by server_seq
  limit least(greatest(lim, 1), 1001);
$$;

revoke all on function public.ukw_push(jsonb) from public, anon;
revoke all on function public.ukw_pull(bigint, integer) from public, anon;
grant execute on function public.ukw_push(jsonb) to authenticated;
grant execute on function public.ukw_pull(bigint, integer) to authenticated;

-- Optional housekeeping: idempotency records older than 30 days are no longer needed.
-- delete from public.ukw_ops where created_at < now() - interval '30 days';
