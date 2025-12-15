-- Database Schema for Mindmaps (aligned with frontend SQLite schema for easy sync)
-- This migration drops and recreates tables - run only on fresh database

-- EXTENSIONS
create extension if not exists pg_trgm;

-- DROP existing tables to recreate with new schema
drop table if exists public.connections cascade;
drop table if exists public.mindmap_nodes cascade;
drop table if exists public.mindmaps cascade;

-- TABLES

-- Mindmaps: stores mindmap metadata (matches frontend schema)
create table public.mindmaps (
  id text primary key,  -- TEXT for frontend compatibility (client generates UUIDs as strings)
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Mindmap',
  central_topic text,
  summary text,
  document_id text,  -- Reference to source document (optional)
  version integer not null default 1 check (version > 0),
  deleted_at bigint,  -- Soft delete timestamp (ms)
  created_at bigint not null default floor(extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default floor(extract(epoch from now()) * 1000)::bigint
);

-- Mindmap nodes: individual nodes within a mindmap (matches frontend schema)
create table public.mindmap_nodes (
  id text primary key,
  mindmap_id text not null references public.mindmaps(id) on delete cascade,
  label text not null default '',
  keywords text,  -- JSON array stored as text
  level integer not null default 0 check (level >= 0),
  parent_id text,  -- Parent node for hierarchy
  position_x real not null default 0,
  position_y real not null default 0,
  notes text,
  version integer not null default 1,
  deleted_at bigint,  -- Soft delete timestamp (ms)
  created_at bigint not null default floor(extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default floor(extract(epoch from now()) * 1000)::bigint
);

-- Connections: relationships between nodes (matches frontend schema)
create table public.connections (
  id text primary key,
  mindmap_id text not null references public.mindmaps(id) on delete cascade,
  from_node_id text not null references public.mindmap_nodes(id) on delete cascade,
  to_node_id text not null references public.mindmap_nodes(id) on delete cascade,
  relationship text,
  version integer not null default 1,
  deleted_at bigint,  -- Soft delete timestamp (ms)
  created_at bigint not null default floor(extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default floor(extract(epoch from now()) * 1000)::bigint
);


-- INDEXES

-- Owner lookup and ordering
create index idx_mindmaps_owner on public.mindmaps(owner_id);
create index idx_mindmaps_owner_updated on public.mindmaps(owner_id, updated_at desc);

-- Active records (exclude soft-deleted)
create index idx_mindmaps_active on public.mindmaps(owner_id) where deleted_at is null;
create index idx_nodes_active on public.mindmap_nodes(mindmap_id) where deleted_at is null;
create index idx_connections_active on public.connections(mindmap_id) where deleted_at is null;

-- Foreign key lookups
create index idx_nodes_mindmap on public.mindmap_nodes(mindmap_id);
create index idx_nodes_parent on public.mindmap_nodes(parent_id) where parent_id is not null;
create index idx_connections_mindmap on public.connections(mindmap_id);

-- Sync: pull records updated after timestamp
create index idx_mindmaps_updated on public.mindmaps(updated_at);
create index idx_nodes_updated on public.mindmap_nodes(updated_at);
create index idx_connections_updated on public.connections(updated_at);

-- Text search
create index idx_nodes_label on public.mindmap_nodes using gin (label gin_trgm_ops);


-- ROW LEVEL SECURITY (RLS)

alter table public.mindmaps enable row level security;
alter table public.mindmap_nodes enable row level security;
alter table public.connections enable row level security;

-- Mindmaps: owner-only access
create policy "mindmaps_insert" on public.mindmaps for insert to authenticated 
  with check (auth.uid() = owner_id);

create policy "mindmaps_select" on public.mindmaps for select to authenticated 
  using (auth.uid() = owner_id);

create policy "mindmaps_update" on public.mindmaps for update to authenticated 
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "mindmaps_delete" on public.mindmaps for delete to authenticated 
  using (auth.uid() = owner_id);

-- Mindmap nodes: access via mindmap ownership
create policy "nodes_insert" on public.mindmap_nodes for insert to authenticated 
  with check (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

create policy "nodes_select" on public.mindmap_nodes for select to authenticated 
  using (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

create policy "nodes_update" on public.mindmap_nodes for update to authenticated 
  using (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()))
  with check (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

create policy "nodes_delete" on public.mindmap_nodes for delete to authenticated 
  using (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

-- Connections: access via mindmap ownership
create policy "connections_insert" on public.connections for insert to authenticated 
  with check (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

create policy "connections_select" on public.connections for select to authenticated 
  using (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

create policy "connections_update" on public.connections for update to authenticated 
  using (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()))
  with check (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));

create policy "connections_delete" on public.connections for delete to authenticated 
  using (exists (select 1 from public.mindmaps where id = mindmap_id and owner_id = auth.uid()));


-- TRIGGERS

-- Auto-update updated_at on changes
create trigger mindmaps_updated_at before update on public.mindmaps
  for each row execute function public.set_updated_at();

create trigger nodes_updated_at before update on public.mindmap_nodes
  for each row execute function public.set_updated_at();

create trigger connections_updated_at before update on public.connections
  for each row execute function public.set_updated_at();


-- PERMISSIONS

grant select, insert, update, delete on public.mindmaps to authenticated;
grant select, insert, update, delete on public.mindmap_nodes to authenticated;
grant select, insert, update, delete on public.connections to authenticated;

grant select, insert, update, delete on public.mindmaps to anon;
grant select, insert, update, delete on public.mindmap_nodes to anon;
grant select, insert, update, delete on public.connections to anon;

grant all on public.mindmaps to service_role;
grant all on public.mindmap_nodes to service_role;
grant all on public.connections to service_role;
