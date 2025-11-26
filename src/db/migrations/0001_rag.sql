-- RAG (Retrieval Augmented Generation) Schema

-- Enable pgvector extension for embeddings
create extension if not exists vector with schema extensions;

-- TABLES

-- Documents table: stores metadata about uploaded documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_object_id uuid not null references storage.objects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

-- Document sections: stores chunked content with embeddings
create table if not exists public.document_sections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  content text not null,
  embedding vector(384), -- all-MiniLM-L6-v2 embedding dimension
  metadata jsonb default '{}'::jsonb,
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


-- INDEXES

-- HNSW index for vector similarity search (inner product for normalized embeddings)
-- Using inner product because embeddings are normalized (faster than cosine)
create index if not exists idx_document_sections_embedding 
  on public.document_sections 
  using hnsw (embedding vector_cosine_ops)
  with (m=16, ef_construction=256);

-- Standard indexes for lookups
create index if not exists idx_documents_created_by on public.documents(created_by);
create index if not exists idx_document_sections_document_id on public.document_sections(document_id);
create index if not exists idx_conversations_user on public.conversations(user_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id);


-- ROW LEVEL SECURITY (RLS)

alter table public.documents enable row level security;
alter table public.document_sections enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Documents: users can only access their own documents
create policy "Users can insert their own documents"
  on public.documents for insert to authenticated 
  with check (auth.uid() = created_by);

create policy "Users can view their own documents"
  on public.documents for select to authenticated 
  using (auth.uid() = created_by);

create policy "Users can update their own documents"
  on public.documents for update to authenticated 
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Users can delete their own documents"
  on public.documents for delete to authenticated 
  using (auth.uid() = created_by);

-- Document sections: users can access sections of their documents
create policy "Users can insert document sections"
  on public.document_sections for insert to authenticated 
  with check (
    document_id in (
      select id from public.documents 
      where created_by = auth.uid()
    )
  );

create policy "Users can view their document sections"
  on public.document_sections for select to authenticated 
  using (
    document_id in (
      select id from public.documents 
      where created_by = auth.uid()
    )
  );

create policy "Users can update their document sections"
  on public.document_sections for update to authenticated 
  using (
    document_id in (
      select id from public.documents 
      where created_by = auth.uid()
    )
  )
  with check (
    document_id in (
      select id from public.documents 
      where created_by = auth.uid()
    )
  );

create policy "Users can delete their document sections"
  on public.document_sections for delete to authenticated 
  using (
    document_id in (
      select id from public.documents 
      where created_by = auth.uid()
    )
  );

-- Conversations: users can only access their own conversations
create policy "Users can insert their own conversations"
  on public.conversations for insert to authenticated 
  with check (auth.uid() = user_id);

create policy "Users can view their own conversations"
  on public.conversations for select to authenticated 
  using (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update to authenticated 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete to authenticated 
  using (auth.uid() = user_id);

-- Messages: users can access messages in their conversations
create policy "Users can insert messages in their conversations"
  on public.messages for insert to authenticated 
  with check (
    exists (
      select 1 from public.conversations 
      where id = conversation_id and user_id = auth.uid()
    )
  );

create policy "Users can view messages in their conversations"
  on public.messages for select to authenticated 
  using (
    exists (
      select 1 from public.conversations 
      where id = conversation_id and user_id = auth.uid()
    )
  );

create policy "Users can update messages in their conversations"
  on public.messages for update to authenticated 
  using (
    exists (
      select 1 from public.conversations 
      where id = conversation_id and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations 
      where id = conversation_id and user_id = auth.uid()
    )
  );

create policy "Users can delete messages in their conversations"
  on public.messages for delete to authenticated 
  using (
    exists (
      select 1 from public.conversations 
      where id = conversation_id and user_id = auth.uid()
    )
  );


-- FUNCTIONS

-- Trigger function for updating updated_at timestamp
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for conversations updated_at
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- Function to match document sections using vector similarity
-- Uses inner product (negative for threshold comparison)
-- Returns setof for PostgREST resource embeddings support
create or replace function public.match_document_sections(
  query_embedding vector(384), 
  match_threshold float default 0.78,
  match_count int default 10,
  filter_document_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    ds.id,
    ds.document_id,
    ds.content,
    ds.metadata,
    (1 - (ds.embedding <=> query_embedding))::float as similarity
  from public.document_sections ds
  where ds.embedding is not null
    and (filter_document_id is null or ds.document_id = filter_document_id)
    and (1 - (ds.embedding <=> query_embedding)) > match_threshold
  order by ds.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Grant execute permissions
grant execute on function public.match_document_sections(vector(384), float, int, uuid) to authenticated;

-- Grant permissions to authenticated users
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_sections to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

-- Service role has all permissions
grant all on public.documents to service_role;
grant all on public.document_sections to service_role;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;