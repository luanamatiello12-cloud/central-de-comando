import "server-only";
import type { Contexto } from "@/lib/contexto";
import type { Supabase } from "@/lib/supabase/server";
import type { Financas, Fixa, Lancamento, Meta, Orcamento, Parcelamento } from "./calculos";

/** As finanças vivem sempre no ambiente Financeiro, qualquer que seja o ambiente selecionado nas outras telas. */
export function ambienteFinanceiro(c: Contexto) {
  const a = c.ambientes.find((x) => x.slug === "financeiro");
  if (!a) throw new Error("O ambiente Financeiro não existe nesta conta.");
  return a;
}

const n = (v: unknown) => Number(v ?? 0);

/** Carrega tudo o que os cálculos precisam. O RLS garante que só vêm dados do próprio usuário. */
export async function carregarFinancas(supabase: Supabase): Promise<Financas> {
  const [cfg, lan, fix, par, orc, met] = await Promise.all([
    supabase.from("fin_settings").select("opening_balance, opening_date").limit(1).maybeSingle(),
    supabase
      .from("fin_transactions")
      .select("id, kind, description, amount, category, occurred_on, recurring_id, ref_month, installment_id, installment_number, goal_id")
      .order("occurred_on", { ascending: false })
      .limit(10000),
    supabase.from("fin_recurring").select("id, kind, description, amount, category, day_of_month, start_month, active").order("day_of_month").limit(500),
    supabase.from("fin_installments").select("id, kind, description, category, installment_amount, total_installments, first_due").order("first_due").limit(500),
    supabase.from("fin_budgets").select("category, monthly_limit").limit(100),
    supabase.from("fin_goals").select("id, name, target_amount, saved_amount, deadline").order("created_at").limit(200),
  ]);
  if (cfg.error || lan.error || fix.error || par.error || orc.error || met.error) {
    throw new Error("Não foi possível carregar os dados financeiros. Se você usa o Supabase, confira se a migração 0002_financeiro.sql foi executada.");
  }
  return {
    config: cfg.data ? { opening_balance: n(cfg.data.opening_balance), opening_date: String(cfg.data.opening_date) } : null,
    lancamentos: (lan.data ?? []).map((l) => ({ ...l, amount: n(l.amount) })) as Lancamento[],
    fixas: (fix.data ?? []).map((x) => ({ ...x, amount: n(x.amount) })) as Fixa[],
    parcelamentos: (par.data ?? []).map((p) => ({ ...p, installment_amount: n(p.installment_amount) })) as Parcelamento[],
    orcamentos: (orc.data ?? []).map((o) => ({ category: String(o.category), monthly_limit: n(o.monthly_limit) })) as Orcamento[],
    metas: (met.data ?? []).map((m) => ({ ...m, target_amount: n(m.target_amount), saved_amount: n(m.saved_amount) })) as Meta[],
  };
}
