-- Schema init
create table if not exists public.mindmaps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  nodes jsonb not null default '[]',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mindmap_nodes (
  id text primary key,
  mindmap_id uuid not null references public.mindmaps(id) on delete cascade,
  text text not null,
  position jsonb not null,
  connections text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.mindmap_analyses (
  id uuid primary key default gen_random_uuid(),
  mindmap_id uuid not null references public.mindmaps(id) on delete cascade,
  analysis_type text not null,
  result jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_mindmaps_owner on public.mindmaps(owner_id);
create index if not exists idx_nodes_mindmap on public.mindmap_nodes(mindmap_id);
