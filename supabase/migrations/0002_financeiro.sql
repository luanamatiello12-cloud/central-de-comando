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
