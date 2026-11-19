"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/contexto";
import { ehDataISO, hojeISO } from "@/lib/datas";
import { centavos, lerValor, reais } from "@/lib/dinheiro";
import { addMeses, compromissosDoMes, mesDe } from "./calculos";
import { ambienteFinanceiro, carregarFinancas } from "./dados";

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const falhar = (msg: string): never => {
  throw new Error(msg);
};
const tipoDe = (v: FormDataEntryValue | null) => (v === "receita" ? "receita" : "despesa");

function valorPositivo(v: FormDataEntryValue | null, oQue = "O valor"): number {
  const n = lerValor(v);
  if (n === null || n <= 0) falhar(`${oQue} precisa ser maior que zero.`);
  return n!;
}
function inteiro(v: FormDataEntryValue | null, min: number, max: number, oQue: string): number {
  const n = Math.floor(Number(texto(v)));
  if (!Number.isFinite(n) || n < min || n > max) falhar(`${oQue} precisa estar entre ${min} e ${max}.`);
  return n;
}
const atualizar = () => revalidatePath("/", "layout");

// ------------------------------------------------------------ saldo inicial

export async function salvarSaldoInicial(form: FormData) {
  const c = await getContexto();
  const saldo = lerValor(form.get("opening_balance"));
  if (saldo === null) falhar("Informe o saldo.");
  const data = ehDataISO(form.get("opening_date")) ? String(form.get("opening_date")) : hojeISO();
  const existe = await c.supabase.from("fin_settings").select("user_id").limit(1).maybeSingle();
  const dados = { opening_balance: saldo, opening_date: data, updated_at: new Date().toISOString() };
  const r = existe.data ? await c.supabase.from("fin_settings").update(dados).eq("user_id", c.user.id) : await c.supabase.from("fin_settings").insert(dados);
  if (existe.error || r.error) falhar("Não foi possível salvar o saldo inicial.");
  atualizar();
}

// -------------------------------------------------------------- lançamentos

export async function criarLancamento(form: FormData) {
  const c = await getContexto();
  const descricao = texto(form.get("description"));
  if (!descricao) falhar("Descreva o lançamento.");
  const { error } = await c.supabase.from("fin_transactions").insert({
    workspace_id: ambienteFinanceiro(c).id,
    kind: tipoDe(form.get("kind")),
    description: descricao,
    amount: valorPositivo(form.get("amount")),
    category: texto(form.get("category")) || "Outros",
    occurred_on: ehDataISO(form.get("occurred_on")) ? String(form.get("occurred_on")) : hojeISO(),
  });
  if (error) falhar("Não foi possível salvar o lançamento.");
  atualizar();
}

export async function atualizarLancamento(form: FormData) {
  const c = await getContexto();
  const descricao = texto(form.get("description"));
  if (!descricao) falhar("A descrição não pode ficar vazia.");
  if (!ehDataISO(form.get("occurred_on"))) falhar("Informe a data.");
  const { error } = await c.supabase
    .from("fin_transactions")
    .update({
      description: descricao,
      amount: valorPositivo(form.get("amount")),
      category: texto(form.get("category")) || "Outros",
      occurred_on: String(form.get("occurred_on")),
    })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar o lançamento.");
  atualizar();
}

/** Excluir um lançamento também desfaz o pagamento que ele representava e devolve o aporte da meta. */
export async function excluirLancamento(form: FormData) {
  const c = await getContexto();
  const id = texto(form.get("id"));
  const { data: l } = await c.supabase.from("fin_transactions").select("id, amount, goal_id").eq("id", id).maybeSingle();
  if (!l) return atualizar();
  if (l.goal_id) {
    const { data: meta } = await c.supabase.from("fin_goals").select("saved_amount").eq("id", l.goal_id).maybeSingle();
    if (meta) {
      const novo = Math.max(0, reais(centavos(Number(meta.saved_amount)) - centavos(Number(l.amount))));
      await c.supabase.from("fin_goals").update({ saved_amount: novo }).eq("id", l.goal_id);
    }
  }
  const { error } = await c.supabase.from("fin_transactions").delete().eq("id", id);
  if (error) falhar("Não foi possível excluir o lançamento.");
  atualizar();
}

// ------------------------------------------------------------- contas fixas

export async function criarFixa(form: FormData) {
  const c = await getContexto();
  const descricao = texto(form.get("description"));
  if (!descricao) falhar("Dê um nome à conta fixa.");
  const dia = inteiro(form.get("day_of_month"), 1, 31, "O dia");
  const hoje = hojeISO();
  // Se o dia já passou neste mês, começa a valer no próximo: evita nascer como "vencida".
  const comeca = dia >= +hoje.slice(8, 10) ? mesDe(hoje) : addMeses(mesDe(hoje), 1);
  const { error } = await c.supabase.from("fin_recurring").insert({
    workspace_id: ambienteFinanceiro(c).id,
    kind: tipoDe(form.get("kind")),
    description: descricao,
    amount: valorPositivo(form.get("amount")),
    category: texto(form.get("category")) || "Outros",
    day_of_month: dia,
    start_month: comeca,
  });
  if (error) falhar("Não foi possível salvar a conta fixa.");
  atualizar();
}

export async function atualizarFixa(form: FormData) {
  const c = await getContexto();
  const descricao = texto(form.get("description"));
  if (!descricao) falhar("O nome não pode ficar vazio.");
  const { error } = await c.supabase
    .from("fin_recurring")
    .update({
      description: descricao,
      amount: valorPositivo(form.get("amount")),
      category: texto(form.get("category")) || "Outros",
      day_of_month: inteiro(form.get("day_of_month"), 1, 31, "O dia"),
      active: form.get("active") !== "0",
    })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar a conta fixa.");
  atualizar();
}

export async function excluirFixa(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("fin_recurring").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir a conta fixa.");
  atualizar();
}

// ------------------------------------------------- parcelas e financiamentos

export async function criarParcelamento(form: FormData) {
  const c = await getContexto();
  const descricao = texto(form.get("description"));
  if (!descricao) falhar("Descreva a compra ou o financiamento.");
  if (!ehDataISO(form.get("first_due"))) falhar("Informe o próximo vencimento.");
  const { error } = await c.supabase.from("fin_installments").insert({
    workspace_id: ambienteFinanceiro(c).id,
    kind: form.get("kind") === "financiamento" ? "financiamento" : "parcela",
    description: descricao,
    category: texto(form.get("category")) || "Outros",
    installment_amount: valorPositivo(form.get("installment_amount"), "O valor da parcela"),
    total_installments: inteiro(form.get("total_installments"), 1, 600, "O número de parcelas"),
    first_due: String(form.get("first_due")),
  });
  if (error) falhar("Não foi possível salvar o parcelamento.");
  atualizar();
}

export async function excluirParcelamento(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("fin_installments").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir o parcelamento.");
  atualizar();
}

// ----------------------------------------------------- pagar e receber

/** Quita uma conta fixa ou parcela de um mês: cria o lançamento correspondente, com a data de hoje. */
export async function quitarCompromisso(form: FormData) {
  const c = await getContexto();
  const mes = texto(form.get("mes"));
  if (!/^\d{4}-\d{2}$/.test(mes)) falhar("Mês inválido.");
  const f = await carregarFinancas(c.supabase);
  const alvo = compromissosDoMes(f, mes).find((x) => x.origem === texto(form.get("origem")) && x.id === texto(form.get("id")));
  if (!alvo) falhar("Este compromisso não existe mais.");
  const comp = alvo!;
  if (comp.lancamentoId) return atualizar();
  const { error } = await c.supabase.from("fin_transactions").insert({
    workspace_id: ambienteFinanceiro(c).id,
    kind: comp.tipo,
    description: comp.numero ? `${comp.descricao} (${comp.numero}/${comp.total})` : comp.descricao,
    amount: comp.valor,
    category: comp.categoria,
    occurred_on: hojeISO(),
    ...(comp.origem === "fixa" ? { recurring_id: comp.id, ref_month: mes } : { installment_id: comp.id, installment_number: comp.numero }),
  });
  if (error) falhar("Não foi possível registrar o pagamento.");
  atualizar();
}

// ---------------------------------------------------------------- orçamento

export async function definirOrcamento(form: FormData) {
  const c = await getContexto();
  const categoria = texto(form.get("category"));
  if (!categoria) falhar("Escolha a categoria.");
  const limite = lerValor(form.get("monthly_limit")) ?? 0;
  const apagou = await c.supabase.from("fin_budgets").delete().eq("category", categoria);
  if (apagou.error) falhar("Não foi possível salvar o limite.");
  if (limite > 0) {
    const { error } = await c.supabase.from("fin_budgets").insert({ category: categoria, monthly_limit: limite });
    if (error) falhar("Não foi possível salvar o limite.");
  }
  atualizar();
}

// -------------------------------------------------------------------- metas

export async function criarMeta(form: FormData) {
  const c = await getContexto();
  const nome = texto(form.get("name"));
  if (!nome) falhar("Dê um nome à meta.");
  const guardado = lerValor(form.get("saved_amount")) ?? 0;
  const { error } = await c.supabase.from("fin_goals").insert({
    workspace_id: ambienteFinanceiro(c).id,
    name: nome,
    target_amount: valorPositivo(form.get("target_amount"), "O valor da meta"),
    saved_amount: Math.max(0, guardado),
    deadline: ehDataISO(form.get("deadline")) ? String(form.get("deadline")) : null,
  });
  if (error) falhar("Não foi possível criar a meta.");
  atualizar();
}

export async function atualizarMeta(form: FormData) {
  const c = await getContexto();
  const nome = texto(form.get("name"));
  if (!nome) falhar("O nome não pode ficar vazio.");
  const { error } = await c.supabase
    .from("fin_goals")
    .update({
      name: nome,
      target_amount: valorPositivo(form.get("target_amount"), "O valor da meta"),
      saved_amount: Math.max(0, lerValor(form.get("saved_amount")) ?? 0),
      deadline: ehDataISO(form.get("deadline")) ? String(form.get("deadline")) : null,
    })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar a meta.");
  atualizar();
}

/** Guarda dinheiro na meta: aumenta o valor guardado e lança a saída, para o saldo disponível refletir. */
export async function aportarNaMeta(form: FormData) {
  const c = await getContexto();
  const id = texto(form.get("id"));
  const valor = valorPositivo(form.get("amount"), "O valor do aporte");
  const { data: meta } = await c.supabase.from("fin_goals").select("id, name, saved_amount").eq("id", id).maybeSingle();
  if (!meta) falhar("A meta não existe mais.");
  const lanc = await c.supabase.from("fin_transactions").insert({
    workspace_id: ambienteFinanceiro(c).id,
    kind: "despesa",
    description: `Aporte: ${meta!.name}`,
    amount: valor,
    category: "Economias",
    occurred_on: hojeISO(),
    goal_id: id,
  });
  if (lanc.error) falhar("Não foi possível registrar o aporte.");
  const { error } = await c.supabase
    .from("fin_goals")
    .update({ saved_amount: reais(centavos(Number(meta!.saved_amount)) + centavos(valor)) })
    .eq("id", id);
  if (error) falhar("O aporte foi lançado, mas não foi possível atualizar a meta.");
  atualizar();
}

export async function excluirMeta(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("fin_goals").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir a meta.");
  atualizar();
}
