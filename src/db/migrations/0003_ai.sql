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

-- Conversations (renamed from ai_chat_sessions for clarity)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  context_mode text default 'rag' check (context_mode in ('rag', 'normal')),
  metadata jsonb default '{}'::jsonb,  -- Store document_id, mindmap_id references
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages (renamed from ai_chat_messages)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}'::jsonb,  -- Store retrieved chunk IDs, relevance scores
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_document_chunks_file on public.document_chunks(file_id);
create index if not exists idx_document_chunks_content on public.document_chunks using gin(to_tsvector('english', content));
-- Use HNSW for better performance in production (requires pgvector 0.5.0+)
create index if not exists idx_document_chunks_embedding on public.document_chunks 
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
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

-- Conversation policies: users can only access their own conversations
create policy "conversations select" on public.conversations for select using (auth.uid() = user_id);
create policy "conversations insert" on public.conversations for insert with check (auth.uid() = user_id);
create policy "conversations update" on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations delete" on public.conversations for delete using (auth.uid() = user_id);

-- Message policies: users can only access messages from their own conversations
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
