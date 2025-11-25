-- Enable pgvector extension for AI embeddings
create extension if not exists vector;

-- Document chunks with embeddings for RAG (Production 2025: Structured Chunking)
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  mindmap_id uuid references public.mindmaps(id) on delete cascade,
  node_id text,  -- Links chunk to mindmap node for scoped queries
  content text not null,
  embedding vector(384),  -- all-MiniLM-L6-v2 dimension
  start_page integer,
  end_page integer,
  chunk_index integer not null,
  
  -- Structured chunking metadata (Structure → Semantic → Window)
  section_heading text,  -- H1/H2/H3 heading this chunk belongs to
  parent_section text,   -- Parent heading for nested sections
  hierarchy_level integer default 0,  -- 1=H1, 2=H2, 3=H3, etc.
  chunk_type text default 'legacy' check (chunk_type in ('legacy', 'section', 'semantic', 'window')),
  window_before text,    -- Context from previous chunk
  window_after text,     -- Context from next chunk
  metadata jsonb default '{}'::jsonb,  -- Additional structured metadata
  
  created_at timestamptz not null default now()
);

-- Conversations for chat history
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  context_mode text default 'rag' check (context_mode in ('rag', 'normal')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages in conversations
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_document_chunks_file on public.document_chunks(file_id);
create index if not exists idx_document_chunks_mindmap_node on public.document_chunks(mindmap_id, node_id);
create index if not exists idx_document_chunks_node on public.document_chunks(node_id);
create index if not exists idx_document_chunks_content on public.document_chunks using gin(to_tsvector('english', content));

-- Optimized HNSW index for vector similarity search
-- m=16: number of connections per layer (balance between quality and speed)
-- ef_construction=256: higher value = better index quality (slower build, better search)
create index if not exists idx_document_chunks_embedding on public.document_chunks 
  using hnsw (embedding vector_cosine_ops) 
  with (m = 16, ef_construction = 256);

-- Composite index for scoped node queries with embedding included
-- This optimizes find_similar_chunks_for_node by covering mindmap_id + node_id filter
create index if not exists idx_document_chunks_mindmap_node_embedding 
  on public.document_chunks (mindmap_id, node_id) 
  include (embedding) 
  where embedding is not null;

-- Structured chunking indexes
create index if not exists idx_document_chunks_hierarchy on public.document_chunks(mindmap_id, hierarchy_level, chunk_index);
create index if not exists idx_document_chunks_section on public.document_chunks(mindmap_id, section_heading);
create index if not exists idx_conversations_user on public.conversations(user_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id);

-- Trigger for conversations updated_at
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- Grant permissions
grant all on public.document_chunks to service_role;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

-- Enable RLS
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Document chunks policies
create policy "chunks select" on public.document_chunks for select using (
  exists (select 1 from public.files f where f.id = file_id and f.user_id = auth.uid())
  or
  exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
);

create policy "chunks insert" on public.document_chunks for insert with check (
  exists (select 1 from public.files f where f.id = file_id and f.user_id = auth.uid())
  or
  exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
);

create policy "chunks update/delete" on public.document_chunks
  for all using (false) with check (false);  -- only service_role can modify/delete chunks

-- Conversation policies
create policy "conversations select" on public.conversations for select using (auth.uid() = user_id);
create policy "conversations insert" on public.conversations for insert with check (auth.uid() = user_id);
create policy "conversations update" on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations delete" on public.conversations for delete using (auth.uid() = user_id);

-- Message policies
create policy "messages select" on public.messages for select
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create policy "messages insert" on public.messages for insert
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create policy "messages update" on public.messages for update
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create policy "messages delete" on public.messages for delete
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- Function to find similar chunks
create or replace function find_similar_chunks(
  query_embedding vector(384), 
  file_id uuid default null, 
  mindmap_id uuid default null, 
  top_k int default 8
)
returns table(id uuid, content text, similarity double precision, chunk_index int)
language plpgsql
security definer
as $$
begin
  -- Check permissions: must own file OR mindmap
  if file_id is not null and not (
    exists (select 1 from public.files f where f.id = file_id and f.user_id = auth.uid())
    or
    exists (select 1 from public.mindmaps m
            join public.document_chunks dc on dc.mindmap_id = m.id
            where dc.file_id = file_id and m.owner_id = auth.uid())
  ) then
    raise exception 'Access denied to file';
  end if;

  if mindmap_id is not null and not (
    exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
  ) then
    raise exception 'Access denied to mindmap';
  end if;

  return query
  select
    dc.id,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::double precision as similarity,
    dc.chunk_index
  from public.document_chunks dc
  where (file_id is null or dc.file_id = file_id)
    and (mindmap_id is null or dc.mindmap_id = mindmap_id)
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit top_k;
end;
$$;

-- Function to find similar chunks for specific node (scoped RAG)
create or replace function find_similar_chunks_for_node(
  query_embedding vector(384),
  p_mindmap_id uuid,
  p_node_id text,
  top_k int default 8
)
returns table(
  id uuid,
  content text,
  similarity double precision,
  chunk_index int,
  node_id text
)
language plpgsql
security definer
as $$
begin
  -- Verify permissions
  if not exists (
    select 1 from public.mindmaps m 
    where m.id = p_mindmap_id and m.owner_id = auth.uid()
  ) then
    raise exception 'Access denied to mindmap';
  end if;

  return query
  select
    dc.id,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::double precision as similarity,
    dc.chunk_index,
    dc.node_id
  from public.document_chunks dc
  where dc.mindmap_id = p_mindmap_id
    and dc.node_id = p_node_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit top_k;
end;
$$;

-- Grant execute to authenticated users
grant execute on function find_similar_chunks(vector(384), uuid, uuid, int) to authenticated;
grant execute on function find_similar_chunks_for_node(vector(384), uuid, text, int) to authenticated;
