-- Rumo — registros dos módulos especializados (Trabalho, Ministério,
-- Faculdade, Carreira, Vida pessoal, Pesquisa).
-- Uma tabela só: cada registro tem um tipo ("ministerio.grupo",
-- "faculdade.avaliacao"...) definido em src/modules/registros/esquemas.ts.
-- Título, situação e data ficam em colunas; os demais campos, em `data`.
-- Para aplicar no Supabase: execute depois do 0002.

create table public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  kind text not null check (kind ~ '^[a-z]+\.[a-z_]+$'),
  -- Registro "pai": a pessoa de um grupo, a avaliação de uma disciplina, o item de uma lista.
  parent_id uuid references public.records (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  status text not null default '',
  date date,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index records_user_kind on public.records (user_id, kind, date);
create index records_parent on public.records (parent_id);

create trigger records_updated before update on public.records for each row execute function public.set_updated_at();
create trigger records_audit after insert or update or delete on public.records for each row execute function public.audit();

alter table public.records enable row level security;
create policy "dono" on public.records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.records to authenticated;
