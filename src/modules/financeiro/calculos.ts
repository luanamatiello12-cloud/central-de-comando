import { addDias, diasEntre, diasNoMes, fmtData, quando } from "@/lib/datas";
import { brl, centavos, reais } from "@/lib/dinheiro";
import type { Alerta } from "@/modules/inteligencia/alertas";

/**
 * Toda a matemática do módulo Financeiro, sem banco e sem IA: recebe os
 * dados e devolve números. As telas e as ferramentas do agente usam as
 * mesmas funções, então a resposta do agente é sempre a mesma da tela.
 */

export const CATEGORIAS_DESPESA = ["Moradia", "Mercado", "Transporte", "Saúde", "Educação", "Lazer", "Contas", "Dívidas", "Economias", "Outros"];
export const CATEGORIAS_RECEITA = ["Salário", "Extra", "Investimentos", "Outros"];

export type Tipo = "receita" | "despesa";
export type Config = { opening_balance: number; opening_date: string };
export type Lancamento = {
  id: string;
  kind: Tipo;
  description: string;
  amount: number;
  category: string;
  occurred_on: string;
  recurring_id: string | null;
  ref_month: string | null;
  installment_id: string | null;
  installment_number: number | null;
  goal_id: string | null;
};
export type Fixa = { id: string; kind: Tipo; description: string; amount: number; category: string; day_of_month: number; start_month: string; active: boolean };
export type Parcelamento = {
  id: string;
  kind: "parcela" | "financiamento";
  description: string;
  category: string;
  installment_amount: number;
  total_installments: number;
  first_due: string;
};
export type Orcamento = { category: string; monthly_limit: number };
export type Meta = { id: string; name: string; target_amount: number; saved_amount: number; deadline: string | null };

export type Financas = {
  config: Config | null;
  lancamentos: Lancamento[];
  fixas: Fixa[];
  parcelamentos: Parcelamento[];
  orcamentos: Orcamento[];
  metas: Meta[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const soma = (valores: number[]) => reais(valores.reduce((a, v) => a + centavos(v), 0));

export function mesDe(iso: string) {
  return iso.slice(0, 7);
}
export function addMeses(mes: string, n: number) {
  const total = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}
export function mesesEntre(de: string, ate: string) {
  return (+ate.slice(0, 4) - +de.slice(0, 4)) * 12 + (+ate.slice(5, 7) - +de.slice(5, 7));
}
/** Dia D do mês, limitado ao último dia (dia 31 em fevereiro vira 28 ou 29). */
export function diaNoMes(mes: string, dia: number) {
  return `${mes}-${pad(Math.min(dia, diasNoMes(mes)))}`;
}
export function nomeDoMes(mes: string) {
  return fmtData(mes + "-15", "curta").split(" ").slice(2).join(" ") || mes;
}

// ------------------------------------------------------------------- saldo

/** Saldo em uma data: saldo inicial mais tudo o que entrou e saiu desde então. */
export function saldoEm(f: Financas, ate: string) {
  if (!f.config) return 0;
  const { opening_balance, opening_date } = f.config;
  let total = centavos(opening_balance);
  for (const l of f.lancamentos) {
    if (l.occurred_on < opening_date || l.occurred_on > ate) continue;
    total += (l.kind === "receita" ? 1 : -1) * centavos(l.amount);
  }
  return reais(total);
}

// ------------------------------------------------------------- compromissos

export type Compromisso = {
  origem: "fixa" | "parcela";
  id: string;
  tipo: Tipo;
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  mes: string;
  /** Número da parcela (1..total); só para parcelamentos. */
  numero: number | null;
  total: number | null;
  /** Lançamento que quitou, se já foi pago ou recebido. */
  lancamentoId: string | null;
};

/** Contas fixas e parcelas que vencem em um mês, com a situação de cada uma. */
export function compromissosDoMes(f: Financas, mes: string): Compromisso[] {
  const lista: Compromisso[] = [];
  for (const x of f.fixas) {
    if (!x.active || x.start_month > mes) continue;
    const pago = f.lancamentos.find((l) => l.recurring_id === x.id && l.ref_month === mes);
    lista.push({
      origem: "fixa",
      id: x.id,
      tipo: x.kind,
      descricao: x.description,
      categoria: x.category,
      valor: x.amount,
      vencimento: diaNoMes(mes, x.day_of_month),
      mes,
      numero: null,
      total: null,
      lancamentoId: pago?.id ?? null,
    });
  }
  for (const p of f.parcelamentos) {
    const numero = mesesEntre(mesDe(p.first_due), mes) + 1;
    if (numero < 1 || numero > p.total_installments) continue;
    const pago = f.lancamentos.find((l) => l.installment_id === p.id && l.installment_number === numero);
    lista.push({
      origem: "parcela",
      id: p.id,
      tipo: "despesa",
      descricao: p.description,
      categoria: p.category,
      valor: p.installment_amount,
      vencimento: diaNoMes(mes, +p.first_due.slice(8, 10)),
      mes,
      numero,
      total: p.total_installments,
      lancamentoId: pago?.id ?? null,
    });
  }
  return lista.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export function parcelasPagas(f: Financas, p: Parcelamento) {
  return f.lancamentos.filter((l) => l.installment_id === p.id).length;
}

/** Compromissos ainda não quitados de vários meses seguidos, a partir de `mesInicial`. */
function pendentesAPartirDe(f: Financas, mesInicial: string, meses: number) {
  const lista: Compromisso[] = [];
  for (let i = 0; i < meses; i++) lista.push(...compromissosDoMes(f, addMeses(mesInicial, i)).filter((c) => !c.lancamentoId));
  return lista;
}

// --------------------------------------------------- livre até o recebimento

export type Livre = {
  saldo: number;
  /** Próxima receita fixa ainda não recebida, se houver. */
  proximoRecebimento: Compromisso | null;
  /** Data até a qual o valor livre precisa durar. */
  ate: string;
  /** Despesas comprometidas que vencem antes dessa data (inclui as atrasadas do mês). */
  comprometido: Compromisso[];
  totalComprometido: number;
  livre: number;
  dias: number;
  porDia: number;
};

/**
 * "Quanto posso gastar até o próximo pagamento?": o saldo de hoje menos as
 * contas fixas e parcelas que vencem antes da próxima receita fixa.
 * Sem receita fixa cadastrada, considera até o fim do mês.
 */
export function livreAteRecebimento(f: Financas, hoje: string): Livre {
  const saldo = saldoEm(f, hoje);
  // Inclui o mês anterior: uma conta vencida e não paga continua comprometendo o saldo.
  const pendentes = pendentesAPartirDe(f, addMeses(mesDe(hoje), -1), 4);
  const proximo = pendentes.filter((c) => c.tipo === "receita" && c.vencimento >= hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0] ?? null;
  const ate = proximo ? proximo.vencimento : diaNoMes(mesDe(hoje), 31);
  // Com recebimento hoje, o período é o próprio dia: contam as contas vencidas e as de hoje.
  const comprometido = pendentes.filter((c) => c.tipo === "despesa" && (proximo && proximo.vencimento > hoje ? c.vencimento < ate : c.vencimento <= ate));
  const totalComprometido = soma(comprometido.map((c) => c.valor));
  const livre = reais(centavos(saldo) - centavos(totalComprometido));
  const dias = Math.max(1, diasEntre(hoje, ate) + (proximo ? 0 : 1));
  return { saldo, proximoRecebimento: proximo, ate, comprometido, totalComprometido, livre, dias, porDia: reais(Math.floor(centavos(Math.max(0, livre)) / dias)) };
}

// ------------------------------------------------------------------ o mês

export function lancamentosDoMes(f: Financas, mes: string) {
  return f.lancamentos.filter((l) => mesDe(l.occurred_on) === mes).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
}

export function resumoDoMes(f: Financas, mes: string) {
  const doMes = lancamentosDoMes(f, mes);
  const entradas = soma(doMes.filter((l) => l.kind === "receita").map((l) => l.amount));
  const saidas = soma(doMes.filter((l) => l.kind === "despesa").map((l) => l.amount));
  return { entradas, saidas, resultado: reais(centavos(entradas) - centavos(saidas)) };
}

export type GastoCategoria = { categoria: string; gasto: number; limite: number | null; uso: number | null };

/** Gasto por categoria no mês, com o limite do orçamento quando existe. Maior gasto primeiro. */
export function gastosPorCategoria(f: Financas, mes: string): GastoCategoria[] {
  const gastos = new Map<string, number>();
  for (const l of lancamentosDoMes(f, mes)) {
    if (l.kind === "despesa") gastos.set(l.category, (gastos.get(l.category) ?? 0) + centavos(l.amount));
  }
  for (const o of f.orcamentos) if (!gastos.has(o.category)) gastos.set(o.category, 0);
  return [...gastos.entries()]
    .map(([categoria, cent]) => {
      const limite = f.orcamentos.find((o) => o.category === categoria)?.monthly_limit ?? null;
      return { categoria, gasto: reais(cent), limite, uso: limite ? cent / centavos(limite) : null };
    })
    .sort((a, b) => b.gasto - a.gasto || a.categoria.localeCompare(b.categoria));
}

// ---------------------------------------------------------------- projeção

/** Despesa avulsa: não é conta fixa, parcela nem aporte em meta. */
const ehAvulsa = (l: Lancamento) => l.kind === "despesa" && !l.recurring_id && !l.installment_id && !l.goal_id;

/**
 * Média mensal das despesas avulsas nos últimos 3 meses completos que têm
 * algum lançamento. É a única estimativa do módulo: `mesesBase` diz em
 * quantos meses ela se apoia (0 = sem histórico, estimativa zerada).
 */
export function mediaAvulsa(f: Financas, hoje: string) {
  const totais: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const mes = addMeses(mesDe(hoje), -i);
    const doMes = f.lancamentos.filter((l) => mesDe(l.occurred_on) === mes);
    if (doMes.length === 0) continue;
    totais.push(doMes.filter(ehAvulsa).reduce((a, l) => a + centavos(l.amount), 0));
  }
  if (totais.length === 0) return { media: 0, mesesBase: 0 };
  return { media: reais(Math.round(totais.reduce((a, v) => a + v, 0) / totais.length)), mesesBase: totais.length };
}

export type MesProjetado = { mes: string; entradas: number; saidas: number; avulsasEstimadas: number; saldoFinal: number };

/**
 * Saldo ao fim de cada um dos próximos meses: parte do saldo de hoje e soma
 * o que ainda falta receber e pagar (fixas e parcelas), menos a estimativa de
 * despesas avulsas. `extra` acrescenta despesas hipotéticas (simulador).
 */
export function projetar(f: Financas, hoje: string, meses = 6, extra: (mes: string) => number = () => 0): MesProjetado[] {
  const { media } = mediaAvulsa(f, hoje);
  const mesAtual = mesDe(hoje);
  let saldo = centavos(saldoEm(f, hoje));
  const linhas: MesProjetado[] = [];
  for (let i = 0; i < meses; i++) {
    const mes = addMeses(mesAtual, i);
    const pendentes = compromissosDoMes(f, mes).filter((c) => !c.lancamentoId);
    const entradas = pendentes.filter((c) => c.tipo === "receita").reduce((a, c) => a + centavos(c.valor), 0);
    const saidas = pendentes.filter((c) => c.tipo === "despesa").reduce((a, c) => a + centavos(c.valor), 0) + centavos(extra(mes));
    // No mês corrente, só a parte da estimativa proporcional aos dias que faltam.
    const fracao = i === 0 ? (diasNoMes(mes) - +hoje.slice(8, 10)) / diasNoMes(mes) : 1;
    const avulsas = Math.round(centavos(media) * fracao);
    saldo += entradas - saidas - avulsas;
    linhas.push({ mes, entradas: reais(entradas), saidas: reais(saidas), avulsasEstimadas: reais(avulsas), saldoFinal: reais(saldo) });
  }
  return linhas;
}

// --------------------------------------------------------------- simulador

/** Renda e compromissos fixos de um mês "cheio" (o próximo), para medir o comprometimento. */
export function rendaEFixos(f: Financas, hoje: string) {
  const proximo = compromissosDoMes(f, addMeses(mesDe(hoje), 1));
  const renda = soma(proximo.filter((c) => c.tipo === "receita").map((c) => c.valor));
  const fixos = soma(proximo.filter((c) => c.tipo === "despesa").map((c) => c.valor));
  return { renda, fixos, comprometimento: renda > 0 ? fixos / renda : null };
}

export type Simulacao = {
  parcela: number;
  totalPago: number;
  juros: number;
  primeiroVencimento: string;
  rendaFixa: number;
  comprometimentoAntes: number | null;
  comprometimentoDepois: number | null;
  semCompra: MesProjetado[];
  comCompra: MesProjetado[];
  menorSaldo: number;
  primeiroMesNegativo: string | null;
};

/**
 * Simula uma compra: à vista (1 parcela) ou parcelada, com juros mensais
 * opcionais (tabela Price). A primeira parcela cai no mês seguinte.
 */
export function simularCompra(f: Financas, hoje: string, valor: number, parcelas: number, jurosMensalPct = 0): Simulacao {
  const n = Math.max(1, Math.floor(parcelas));
  const i = Math.max(0, jurosMensalPct) / 100;
  const parcelaCent = i > 0 ? Math.round((centavos(valor) * i) / (1 - Math.pow(1 + i, -n))) : Math.round(centavos(valor) / n);
  const parcela = reais(parcelaCent);
  const mesAtual = mesDe(hoje);
  const primeiro = addMeses(mesAtual, 1);
  const horizonte = Math.max(6, Math.min(n + 1, 36));
  const extra = (mes: string) => {
    const k = mesesEntre(primeiro, mes);
    return k >= 0 && k < n ? parcela : 0;
  };
  const semCompra = projetar(f, hoje, horizonte);
  const comCompra = projetar(f, hoje, horizonte, extra);
  const { renda, fixos, comprometimento } = rendaEFixos(f, hoje);
  const negativo = comCompra.find((m) => m.saldoFinal < 0);
  return {
    parcela,
    totalPago: reais(parcelaCent * n),
    juros: reais(parcelaCent * n - centavos(valor)),
    primeiroVencimento: diaNoMes(primeiro, +hoje.slice(8, 10)),
    rendaFixa: renda,
    comprometimentoAntes: comprometimento,
    comprometimentoDepois: renda > 0 ? (centavos(fixos) + parcelaCent) / centavos(renda) : null,
    semCompra,
    comCompra,
    menorSaldo: Math.min(...comCompra.map((m) => m.saldoFinal)),
    primeiroMesNegativo: negativo?.mes ?? null,
  };
}

// -------------------------------------------------------------------- metas

export type PlanoDaMeta = { falta: number; pct: number; meses: number | null; porMes: number | null; vencida: boolean };

/** Quanto falta e quanto guardar por mês para chegar na meta até o prazo (contando o mês atual). */
export function planoDaMeta(m: Meta, hoje: string): PlanoDaMeta {
  const falta = Math.max(0, reais(centavos(m.target_amount) - centavos(m.saved_amount)));
  const pct = Math.min(100, Math.round((m.saved_amount / m.target_amount) * 100));
  if (!m.deadline) return { falta, pct, meses: null, porMes: null, vencida: false };
  const vencida = m.deadline < hoje && falta > 0;
  const meses = Math.max(1, mesesEntre(mesDe(hoje), mesDe(m.deadline)) + 1);
  return { falta, pct, meses, porMes: reais(Math.ceil(centavos(falta) / meses)), vencida };
}

// ------------------------------------------------------------------ alertas

export function alertasFinanceiros(f: Financas, hoje: string): Alerta[] {
  const alertas: Alerta[] = [];
  const href = "/financeiro";
  const mes = mesDe(hoje);
  const pendentes = pendentesAPartirDe(f, addMeses(mes, -1), 3).filter((c) => c.tipo === "despesa");

  const atrasadas = pendentes.filter((c) => c.vencimento < hoje);
  if (atrasadas.length) {
    alertas.push({
      tipo: "atraso",
      titulo: `${atrasadas.length} ${atrasadas.length === 1 ? "conta vencida" : "contas vencidas"} sem pagamento`,
      detalhe: atrasadas.map((c) => `${c.descricao} (${brl(c.valor)}, venceu ${quando(c.vencimento, hoje)})`).join("; "),
      href,
      grave: true,
    });
  }

  const proximas = pendentes.filter((c) => c.vencimento >= hoje && c.vencimento <= addDias(hoje, 5));
  if (proximas.length) {
    alertas.push({
      tipo: "prazo",
      titulo: `${proximas.length} ${proximas.length === 1 ? "conta vence" : "contas vencem"} nos próximos 5 dias`,
      detalhe: proximas.map((c) => `${c.descricao} (${brl(c.valor)}, ${quando(c.vencimento, hoje)})`).join("; "),
      href,
      grave: false,
    });
  }

  for (const g of gastosPorCategoria(f, mes)) {
    if (g.uso === null || g.limite === null || g.uso < 0.9) continue;
    alertas.push({
      tipo: "prazo",
      titulo: g.uso > 1 ? `Orçamento de ${g.categoria} estourado` : `Orçamento de ${g.categoria} quase no limite`,
      detalhe: `${brl(g.gasto)} gastos de ${brl(g.limite)} neste mês (${Math.round(g.uso * 100)}%).`,
      href,
      grave: g.uso > 1,
    });
  }

  if (f.config) {
    const negativo = projetar(f, hoje, 3).find((m) => m.saldoFinal < 0);
    if (negativo) {
      alertas.push({
        tipo: "prazo",
        titulo: `Saldo projetado fica negativo em ${nomeDoMes(negativo.mes)}`,
        detalhe: `Pela projeção, o mês termina em ${brl(negativo.saldoFinal)}.`,
        href,
        grave: true,
      });
    }
  }

  for (const m of f.metas) {
    if (planoDaMeta(m, hoje).vencida) {
      alertas.push({
        tipo: "atraso",
        titulo: `Meta com prazo vencido: ${m.name}`,
        detalhe: `Faltam ${brl(planoDaMeta(m, hoje).falta)}. Defina um novo prazo ou ajuste o valor.`,
        href,
        grave: false,
      });
    }
  }
  return alertas;
}
