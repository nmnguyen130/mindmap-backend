-- Mindmaps core table
create table if not exists public.mindmaps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Mindmap',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nodes table for individual mind map nodes
create table if not exists public.mindmap_nodes (
  id text primary key,  -- String ID for frontend compatibility
  mindmap_id uuid not null references public.mindmaps(id) on delete cascade,
  text text not null default '',
  position jsonb not null default '{"x":0,"y":0}'::jsonb,
  parent_id text,  -- Parent node ID for hierarchy
  children_order text[] not null default '{}',  -- Child node IDs in display order
  data jsonb default '{}'::jsonb,  -- Node-specific data (styles, icons, etc.)
  notes text,
  collapsed boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_nodes_mindmap on public.mindmap_nodes(mindmap_id);
create index if not exists idx_nodes_text on public.mindmap_nodes using gin (text gin_trgm_ops);
create index if not exists idx_nodes_parent on public.mindmap_nodes(parent_id);
create index if not exists idx_nodes_mindmap_parent on public.mindmap_nodes(mindmap_id, parent_id);

-- Files table
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  created_at timestamptz not null default now()
);

-- AI analyses table
create table if not exists public.mindmap_analyses (
  id uuid primary key default gen_random_uuid(),
  mindmap_id uuid not null references public.mindmaps(id) on delete cascade,
  analysis_type text not null,
  result jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger mindmaps_updated_at
  before update on public.mindmaps
  for each row execute function public.set_updated_at();

create trigger nodes_updated_at
  before update on public.mindmap_nodes
  for each row execute function public.set_updated_at();

-- Permissions
grant all on public.mindmaps to service_role;
grant all on public.mindmap_nodes to service_role;
grant all on public.files to service_role;
grant all on public.mindmap_analyses to service_role;
