-- Enable RLS
alter table public.mindmaps enable row level security;
alter table public.mindmap_nodes enable row level security;
alter table public.files enable row level security;
alter table public.mindmap_analyses enable row level security;

-- Policies
create policy mindmaps_owner_select on public.mindmaps for select using (auth.uid() = owner_id);
create policy mindmaps_owner_mod on public.mindmaps for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy nodes_owner_select on public.mindmap_nodes for select using (
  exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
);
create policy nodes_owner_mod on public.mindmap_nodes for all using (
  exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
) with check (
  exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
);

create policy files_owner_select on public.files for select using (auth.uid() = user_id);
create policy files_owner_mod on public.files for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy analyses_owner_select on public.mindmap_analyses for select using (
  exists (select 1 from public.mindmaps m where m.id = mindmap_id and m.owner_id = auth.uid())
);