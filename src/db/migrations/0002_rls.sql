-- Enable RLS on all tables
alter table public.mindmaps enable row level security;
alter table public.mindmap_nodes enable row level security;
alter table public.files enable row level security;
alter table public.mindmap_analyses enable row level security;

-- Mindmaps: owner-only access for all operations
create policy "owner select mindmaps" on public.mindmaps for select using (auth.uid() = owner_id);
create policy "owner insert mindmaps" on public.mindmaps for insert with check (auth.uid() = owner_id);
create policy "owner update mindmaps" on public.mindmaps for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner delete mindmaps" on public.mindmaps for delete using (auth.uid() = owner_id);

-- Nodes: only mindmap owner can access nodes
create policy "nodes select" on public.mindmap_nodes for select
  using (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

create policy "nodes insert" on public.mindmap_nodes for insert
  with check (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

create policy "nodes update" on public.mindmap_nodes for update
  using (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

create policy "nodes delete" on public.mindmap_nodes for delete
  using (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

-- Files: owner-only access
create policy "files select" on public.files for select using (auth.uid() = user_id);
create policy "files insert" on public.files for insert with check (auth.uid() = user_id);
create policy "files update" on public.files for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "files delete" on public.files for delete using (auth.uid() = user_id);

-- Analyses: only mindmap owner can access analyses
create policy "analyses select" on public.mindmap_analyses for select
  using (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

create policy "analyses insert" on public.mindmap_analyses for insert
  with check (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

create policy "analyses update" on public.mindmap_analyses for update
  using (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));

create policy "analyses delete" on public.mindmap_analyses for delete
  using (exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid()));
