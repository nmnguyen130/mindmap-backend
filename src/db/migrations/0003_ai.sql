-- Enable pgvector extension for AI embeddings
create extension if not exists vector;

-- Add source file reference to mindmaps
alter table public.mindmaps add column if not exists source_file_id uuid references public.files(id) on delete set null;

-- PDF document chunks with embeddings
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  mindmap_id uuid references public.mindmaps(id) on delete cascade,
  content text not null,
  embedding vector(1536),  -- OpenAI ada-002 dimension
  start_page integer,
  end_page integer,
  chunk_index integer not null,
  created_at timestamptz not null default now()
);

-- AI chat sessions
create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  mindmap_id uuid not null references public.mindmaps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AI chat messages
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  relevant_chunks jsonb,  -- Store chunk IDs or content for context
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_document_chunks_file_mindmap on public.document_chunks(file_id, mindmap_id);
create index if not exists idx_document_chunks_embedding on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_ai_chat_sessions_mindmap on public.ai_chat_sessions(mindmap_id, user_id);
create index if not exists idx_ai_messages_session on public.ai_chat_messages(session_id);

-- Trigger for chat session updated_at
create trigger ai_sessions_updated_at
  before update on public.ai_chat_sessions
  for each row execute function public.set_updated_at();

-- Grant permissions
grant all on public.document_chunks to service_role;
grant all on public.ai_chat_sessions to service_role;
grant all on public.ai_chat_messages to service_role;

-- Enable RLS
alter table public.document_chunks enable row level security;
alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;

-- Document chunks policies: owner access via file or mindmap ownership
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

-- AI chat session policies
create policy "chat sessions all" on public.ai_chat_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- AI chat message policies
create policy "chat msg select" on public.ai_chat_messages for select
  using (exists (select 1 from public.ai_chat_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "chat msg insert" on public.ai_chat_messages for insert
  with check (exists (select 1 from public.ai_chat_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "chat msg update" on public.ai_chat_messages for update
  using (exists (select 1 from public.ai_chat_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_chat_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy "chat msg delete" on public.ai_chat_messages for delete
  using (exists (select 1 from public.ai_chat_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- Function to find similar chunks
create or replace function find_similar_chunks(query_embedding vector(1536), file_id uuid default null, mindmap_id uuid default null, top_k int default 5)
returns table(id uuid, content text, similarity float, chunk_index int)
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
    (dc.embedding <=> query_embedding)::float as similarity,
    dc.chunk_index
  from public.document_chunks dc
  where (file_id is null or dc.file_id = file_id)
    and (mindmap_id is null or dc.mindmap_id = mindmap_id)
  order by dc.embedding <=> query_embedding
  limit top_k;
end;
$$;

-- Grant execute to authenticated users
grant execute on function find_similar_chunks(vector(1536), uuid, uuid, int) to authenticated;
