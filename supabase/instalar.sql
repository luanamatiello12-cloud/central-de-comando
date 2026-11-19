-- Rumo — instalação completa do banco no Supabase.
-- GERADO a partir de supabase/migrations/ por `npm run sql:instalar`. Não edite à mão.
-- Como usar: no painel do Supabase, abra o SQL Editor, cole este arquivo inteiro e execute uma vez.
-- Em um banco que já tem as tabelas, não execute de novo: aplique só as migrações novas.

-- ======================================================================
-- 0001_base.sql
-- ======================================================================

-- Rumo — base do MVP: perfis, ambientes, projetos, tarefas, calendário,
-- conversas, memória, log do agente e auditoria. Tudo com RLS por usuário.
-- Para aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute.


-- ---------------------------------------------------------------- utilidades
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -------------------------------------------------------------------- perfis
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- ambientes
-- Cada registro pertence a um ambiente. `agent_access` decide se o agente
-- pode ler e escrever nele (Ministério começa desligado).
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text not null,
  name text not null,
  sort int not null default 0,
  agent_access boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, slug),
  unique (id, user_id)
);

-- ------------------------------------------------------------------ projetos
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido', 'arquivado')),
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta')),
  due_date date,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index projects_user_ws on public.projects (user_id, workspace_id, status);

-- ------------------------------------------------------------------- tarefas
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  project_id uuid,
  parent_id uuid references public.tasks (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text not null default '',
  status text not null default 'aberta' check (status in ('aberta', 'concluida')),
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta')),
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);
create index tasks_user_ws on public.tasks (user_id, workspace_id, status, due_date);
create index tasks_project on public.tasks (project_id);
create index tasks_parent on public.tasks (parent_id);

-- ------------------------------------------------------------------- eventos
-- Agenda pessoal em um único fuso: data e horários locais, sem conversão.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  event_date date not null,
  start_time time,
  end_time time,
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or start_time is not null),
  check (end_time is null or end_time > start_time),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index events_user_date on public.events (user_id, event_date);

-- ----------------------------------------------------- conversas e mensagens
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  title text not null default 'Nova conversa',
  -- O usuário autoriza, por conversa, a consulta a outros ambientes.
  allow_cross boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index conversations_user on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.conversations (id, user_id) on delete cascade
);
create index messages_conversation on public.messages (conversation_id, created_at);

-- ------------------------------------------------------------------- memória
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  project_id uuid,
  kind text not null default 'fato' check (kind in ('preferencia', 'decisao', 'fato', 'contexto')),
  content text not null check (length(trim(content)) > 0),
  source text not null default 'usuario' check (source in ('usuario', 'agente')),
  fts tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);
create index memories_user_ws on public.memories (user_id, workspace_id, kind);
create index memories_fts on public.memories using gin (fts);

-- ------------------------------------------------------------- log do agente
-- Toda ferramenta que o agente executa fica aqui. Ações sensíveis entram como
-- 'pendente' e só acontecem depois que o usuário confirma na tela.
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  tool text not null,
  input jsonb not null default '{}',
  result jsonb,
  summary text not null default '',
  status text not null default 'executada' check (status in ('executada', 'pendente', 'confirmada', 'cancelada', 'erro')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index agent_actions_user on public.agent_actions (user_id, status, created_at desc);

-- ----------------------------------------------------------------- auditoria
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  workspace_id uuid,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  label text not null default '',
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index audit_user_at on public.audit_log (user_id, at desc);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  n jsonb;
  r jsonb;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old) - 'fts'; end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new) - 'fts'; end if;
  -- Ignora atualizações automáticas (ex.: movimentação do projeto ao mexer numa tarefa).
  if tg_op = 'UPDATE' and (n - 'updated_at' - 'last_activity_at') = (o - 'updated_at' - 'last_activity_at') then
    return new;
  end if;
  r := coalesce(n, o);
  insert into public.audit_log (user_id, workspace_id, table_name, row_id, action, label, old_data, new_data)
  values (
    (r ->> 'user_id')::uuid,
    (r ->> 'workspace_id')::uuid,
    tg_table_name,
    (r ->> 'id')::uuid,
    lower(tg_op),
    left(coalesce(r ->> 'title', r ->> 'name', r ->> 'content', ''), 120),
    o,
    n
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Mexer em uma tarefa conta como movimentação do projeto.
create or replace function public.touch_project() returns trigger
language plpgsql as $$
declare
  pid uuid;
begin
  if tg_op = 'DELETE' then pid := old.project_id; else pid := new.project_id; end if;
  if pid is not null then
    update public.projects set last_activity_at = now() where id = pid;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger events_updated before update on public.events for each row execute function public.set_updated_at();
create trigger memories_updated before update on public.memories for each row execute function public.set_updated_at();
create trigger conversations_updated before update on public.conversations for each row execute function public.set_updated_at();

create trigger projects_audit after insert or update or delete on public.projects for each row execute function public.audit();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.audit();
create trigger events_audit after insert or update or delete on public.events for each row execute function public.audit();
create trigger memories_audit after insert or update or delete on public.memories for each row execute function public.audit();

create trigger tasks_touch_project after insert or update or delete on public.tasks for each row execute function public.touch_project();

-- ------------------------------------------------- ambientes padrão por conta
create or replace function public.criar_ambientes_padrao(uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.workspaces (user_id, slug, name, sort, agent_access) values
    (uid, 'pessoal', 'Pessoal', 1, true),
    (uid, 'trabalho', 'Trabalho', 2, true),
    (uid, 'ministerio', 'Ministério', 3, false),
    (uid, 'academico', 'Acadêmico', 4, true),
    (uid, 'financeiro', 'Financeiro', 5, true)
  on conflict (user_id, slug) do nothing;
$$;
revoke all on function public.criar_ambientes_padrao(uuid) from public, anon, authenticated;

-- Para contas criadas antes desta migração: o app chama esta função no primeiro acesso.
create or replace function public.garantir_ambientes() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  perform public.criar_ambientes_padrao(auth.uid());
end $$;
revoke all on function public.garantir_ambientes() from public, anon;
grant execute on function public.garantir_ambientes() to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  perform public.criar_ambientes_padrao(new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.agent_actions enable row level security;
alter table public.audit_log enable row level security;

create policy "dono" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "dono" on public.workspaces for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.messages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.memories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.agent_actions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A auditoria só é escrita pelos gatilhos; o usuário apenas lê a própria.
create policy "dono le" on public.audit_log for select to authenticated
  using (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.workspaces, public.projects, public.tasks, public.events,
  public.conversations, public.messages, public.memories, public.agent_actions
  to authenticated;
grant select on public.audit_log to authenticated;

-- ======================================================================
-- 0002_financeiro.sql
-- ======================================================================

-- Rumo — módulo Financeiro: saldo inicial, lançamentos, contas fixas,
-- parcelas e financiamentos, orçamento por categoria e metas.
-- Tudo pertence ao ambiente Financeiro do usuário e tem RLS.
-- Para aplicar no Supabase: cole este arquivo no SQL Editor e execute (depois do 0001).

-- Ponto de partida do saldo: quanto havia em `opening_date`.
create table public.fin_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  opening_balance numeric(12, 2) not null default 0,
  opening_date date not null default current_date,
  updated_at timestamptz not null default now()
);

-- Receitas e despesas que se repetem todo mês (salário, aluguel, internet).
create table public.fin_recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  kind text not null check (kind in ('receita', 'despesa')),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'Outros',
  day_of_month int not null check (day_of_month between 1 and 31),
  -- Primeiro mês em que vale, no formato AAAA-MM.
  start_month text not null check (start_month ~ '^\d{4}-\d{2}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index fin_recurring_user on public.fin_recurring (user_id, active);

-- Compras parceladas e financiamentos: N parcelas mensais de valor fixo.
create table public.fin_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  kind text not null default 'parcela' check (kind in ('parcela', 'financiamento')),
  description text not null check (length(trim(description)) > 0),
  category text not null default 'Outros',
  installment_amount numeric(12, 2) not null check (installment_amount > 0),
  total_installments int not null check (total_installments between 1 and 600),
  first_due date not null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index fin_installments_user on public.fin_installments (user_id);

create table public.fin_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  deadline date,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index fin_goals_user on public.fin_goals (user_id);

-- Tudo o que entrou ou saiu de fato. Pagamentos de contas fixas, parcelas e
-- aportes em metas são lançamentos ligados à sua origem.
create table public.fin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  kind text not null check (kind in ('receita', 'despesa')),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'Outros',
  occurred_on date not null,
  recurring_id uuid references public.fin_recurring (id) on delete set null,
  -- Mês de referência (AAAA-MM) da conta fixa que este lançamento quita.
  ref_month text check (ref_month ~ '^\d{4}-\d{2}$'),
  installment_id uuid references public.fin_installments (id) on delete set null,
  installment_number int,
  goal_id uuid references public.fin_goals (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.workspaces (id, user_id) on delete cascade
);
create index fin_transactions_user_date on public.fin_transactions (user_id, occurred_on desc);
-- Uma conta fixa só pode ser quitada uma vez por mês; uma parcela, uma vez por número.
create unique index fin_tx_fixa_mes on public.fin_transactions (recurring_id, ref_month) where recurring_id is not null;
create unique index fin_tx_parcela_num on public.fin_transactions (installment_id, installment_number) where installment_id is not null;

-- Limite mensal de gasto por categoria (planejamento).
create table public.fin_budgets (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category text not null,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  primary key (user_id, category)
);

-- A auditoria passa a usar também `description` como rótulo.
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  n jsonb;
  r jsonb;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old) - 'fts'; end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new) - 'fts'; end if;
  if tg_op = 'UPDATE' and (n - 'updated_at' - 'last_activity_at') = (o - 'updated_at' - 'last_activity_at') then
    return new;
  end if;
  r := coalesce(n, o);
  insert into public.audit_log (user_id, workspace_id, table_name, row_id, action, label, old_data, new_data)
  values (
    (r ->> 'user_id')::uuid,
    (r ->> 'workspace_id')::uuid,
    tg_table_name,
    (r ->> 'id')::uuid,
    lower(tg_op),
    left(coalesce(r ->> 'title', r ->> 'name', r ->> 'content', r ->> 'description', ''), 120),
    o,
    n
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger fin_transactions_audit after insert or update or delete on public.fin_transactions for each row execute function public.audit();
create trigger fin_recurring_audit after insert or update or delete on public.fin_recurring for each row execute function public.audit();
create trigger fin_installments_audit after insert or update or delete on public.fin_installments for each row execute function public.audit();
create trigger fin_goals_audit after insert or update or delete on public.fin_goals for each row execute function public.audit();

alter table public.fin_settings enable row level security;
alter table public.fin_recurring enable row level security;
alter table public.fin_installments enable row level security;
alter table public.fin_goals enable row level security;
alter table public.fin_transactions enable row level security;
alter table public.fin_budgets enable row level security;

create policy "dono" on public.fin_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.fin_recurring for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.fin_installments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.fin_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.fin_transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono" on public.fin_budgets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.fin_settings, public.fin_recurring, public.fin_installments,
  public.fin_goals, public.fin_transactions, public.fin_budgets
  to authenticated;

-- ======================================================================
-- 0003_modulos.sql
-- ======================================================================

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
