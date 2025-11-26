-- Database Schema (Mindmaps and Files)

-- EXTENSIONS

-- Enable pg_trgm extension for fuzzy text search on mindmap nodes
create extension if not exists pg_trgm;


-- TABLES

-- Mindmaps core table: stores mindmap metadata and data
create table if not exists public.mindmaps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Mindmap',
  version int not null default 1 check (version > 0),
  source_document_id uuid references public.documents(id) on delete set null,
  mindmap_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mindmap nodes: individual nodes within a mindmap
create table if not exists public.mindmap_nodes (
  id text primary key,  -- String ID for frontend compatibility
  mindmap_id uuid not null references public.mindmaps(id) on delete cascade,
  text text not null default '',
  notes text,
  position jsonb not null default '{"x":0,"y":0}'::jsonb,
  parent_id text,  -- Parent node ID for hierarchy
  children_order text[] not null default '{}',  -- Child node IDs in display order
  collapsed boolean default false,
  data jsonb default '{}'::jsonb,  -- Node-specific data (styles, icons, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- INDEXES

-- GIN indexes for JSONB fields
create index if not exists idx_mindmaps_data on public.mindmaps using gin(mindmap_data);

-- GIN index for fuzzy text search on mindmap nodes
create index if not exists idx_nodes_text on public.mindmap_nodes using gin (text gin_trgm_ops);

-- Standard B-tree indexes for foreign key lookups
create index if not exists idx_mindmaps_owner on public.mindmaps(owner_id);
create index if not exists idx_mindmaps_created_at on public.mindmaps(created_at desc);
create index if not exists idx_mindmaps_source_document on public.mindmaps(source_document_id);
create index if not exists idx_nodes_mindmap on public.mindmap_nodes(mindmap_id);
create index if not exists idx_nodes_parent on public.mindmap_nodes(parent_id);

-- Composite indexes for common query patterns
create index if not exists idx_nodes_mindmap_parent on public.mindmap_nodes(mindmap_id, parent_id);
create index if not exists idx_mindmaps_owner_created on public.mindmaps(owner_id, created_at desc);


-- ROW LEVEL SECURITY (RLS)

alter table public.mindmaps enable row level security;
alter table public.mindmap_nodes enable row level security;

-- Mindmaps: owner-only access for all operations
create policy "Users can insert their own mindmaps"
  on public.mindmaps for insert to authenticated 
  with check (auth.uid() = owner_id);

create policy "Users can view their own mindmaps"
  on public.mindmaps for select to authenticated 
  using (auth.uid() = owner_id);

create policy "Users can update their own mindmaps"
  on public.mindmaps for update to authenticated 
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own mindmaps"
  on public.mindmaps for delete to authenticated 
  using (auth.uid() = owner_id);

-- Mindmap nodes: users can access nodes of their mindmaps
create policy "Users can insert nodes in their mindmaps"
  on public.mindmap_nodes for insert to authenticated 
  with check (
    exists (
      select 1 from public.mindmaps 
      where id = mindmap_id and owner_id = auth.uid()
    )
  );

create policy "Users can view nodes in their mindmaps"
  on public.mindmap_nodes for select to authenticated 
  using (
    exists (
      select 1 from public.mindmaps 
      where id = mindmap_id and owner_id = auth.uid()
    )
  );

create policy "Users can update nodes in their mindmaps"
  on public.mindmap_nodes for update to authenticated 
  using (
    exists (
      select 1 from public.mindmaps 
      where id = mindmap_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.mindmaps 
      where id = mindmap_id and owner_id = auth.uid()
    )
  );

create policy "Users can delete nodes in their mindmaps"
  on public.mindmap_nodes for delete to authenticated 
  using (
    exists (
      select 1 from public.mindmaps 
      where id = mindmap_id and owner_id = auth.uid()
    )
  );


-- FUNCTIONS

-- Triggers for updated_at columns (function defined in 0001_rag.sql)
create trigger mindmaps_updated_at
  before update on public.mindmaps
  for each row execute function public.set_updated_at();

create trigger nodes_updated_at
  before update on public.mindmap_nodes
  for each row execute function public.set_updated_at();


-- PERMISSIONS

-- Grant permissions to authenticated users
grant select, insert, update, delete on public.mindmaps to authenticated;
grant select, insert, update, delete on public.mindmap_nodes to authenticated;

-- Grant permissions to anon role (with RLS protection)
grant select, insert, update, delete on public.mindmaps to anon;
grant select, insert, update, delete on public.mindmap_nodes to anon;

-- Service role has all permissions
grant all on public.mindmaps to service_role;
grant all on public.mindmap_nodes to service_role;
