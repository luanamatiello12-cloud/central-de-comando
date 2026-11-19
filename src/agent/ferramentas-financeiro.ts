import "server-only";
import { z } from "zod";
import { ehDataISO } from "@/lib/datas";
import {
  alertasFinanceiros,
  compromissosDoMes,
  gastosPorCategoria,
  lancamentosDoMes,
  livreAteRecebimento,
  mediaAvulsa,
  mesDe,
  planoDaMeta,
  projetar,
  rendaEFixos,
  resumoDoMes,
  simularCompra,
} from "@/modules/financeiro/calculos";
import { carregarFinancas } from "@/modules/financeiro/dados";
import type { ContextoAgente, Ferramenta } from "./ferramentas";

/**
 * Ferramentas financeiras do agente. Usam os MESMOS cálculos da tela
 * (modules/financeiro/calculos.ts): o agente não faz conta por conta própria.
 * Só funcionam se o ambiente Financeiro estiver liberado para a conversa.
 */
const ferramenta = <S extends z.ZodType>(f: Ferramenta<S>) => f as unknown as Ferramenta;

const mesISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM.");
const dataISO = z.string().refine(ehDataISO, "Use o formato AAAA-MM-DD.");

function financeiro(c: ContextoAgente) {
  const a = c.permitidos.find((x) => x.slug === "financeiro");
  if (!a) {
    throw new Error(
      "O ambiente Financeiro não está liberado para esta conversa. Diga ao usuário que ele pode autorizar a consulta a outros ambientes nesta conversa, ou abrir uma conversa no ambiente Financeiro.",
    );
  }
  return a;
}

export const FERRAMENTAS_FINANCEIRAS: Ferramenta[] = [
  ferramenta({
    nome: "resumo_financeiro",
    descricao:
      "Situação financeira atual, já calculada: saldo de hoje, quanto está livre até o próximo recebimento (e por dia), contas que comprometem esse valor, resultado do mês, renda fixa e percentual comprometido, orçamento por categoria, metas com quanto guardar por mês, projeção de saldo dos próximos 6 meses e alertas. Use para 'quanto tenho disponível', 'quanto posso gastar até o próximo pagamento' e 'quanto preciso economizar para a meta'.",
    esquema: z.object({}),
    async executar(_e, c) {
      financeiro(c);
      const f = await carregarFinancas(c.supabase);
      const livre = livreAteRecebimento(f, c.hoje);
      const mes = mesDe(c.hoje);
      const { media, mesesBase } = mediaAvulsa(f, c.hoje);
      return {
        resultado: {
          hoje: c.hoje,
          saldo_inicial_informado: Boolean(f.config),
          saldo_hoje: livre.saldo,
          livre_ate_proximo_recebimento: {
            valor_livre: livre.livre,
            valido_ate: livre.ate,
            dias: livre.dias,
            por_dia: livre.porDia,
            proximo_recebimento: livre.proximoRecebimento ? { descricao: livre.proximoRecebimento.descricao, valor: livre.proximoRecebimento.valor, data: livre.proximoRecebimento.vencimento } : null,
            contas_descontadas: livre.comprometido.map((x) => ({ descricao: x.descricao, valor: x.valor, vencimento: x.vencimento })),
            total_descontado: livre.totalComprometido,
            como_foi_calculado: "saldo de hoje menos as contas fixas e parcelas não pagas que vencem antes do próximo recebimento",
          },
          mes_atual: resumoDoMes(f, mes),
          renda_e_compromissos_fixos_mensais: rendaEFixos(f, c.hoje),
          orcamento_por_categoria: gastosPorCategoria(f, mes),
          metas: f.metas.map((m) => ({ nome: m.name, alvo: m.target_amount, guardado: m.saved_amount, prazo: m.deadline, ...planoDaMeta(m, c.hoje) })),
          projecao_saldo_fim_de_mes: projetar(f, c.hoje, 6),
          estimativa_despesas_avulsas: { media_mensal: media, meses_de_historico: mesesBase, observacao: mesesBase === 0 ? "sem histórico: a projeção não inclui despesas avulsas" : "média dos meses anteriores" },
          alertas: alertasFinanceiros(f, c.hoje).map(({ titulo, detalhe, grave }) => ({ titulo, detalhe, grave })),
        },
        resumo: "Consultou o resumo financeiro",
      };
    },
  }),

  ferramenta({
    nome: "listar_lancamentos",
    descricao: "Lista as entradas e saídas registradas em um mês.",
    esquema: z.object({ mes: mesISO.optional().describe("Padrão: mês atual."), tipo: z.enum(["receita", "despesa"]).optional() }),
    async executar(e, c) {
      financeiro(c);
      const f = await carregarFinancas(c.supabase);
      const mes = e.mes ?? mesDe(c.hoje);
      const lista = lancamentosDoMes(f, mes)
        .filter((l) => !e.tipo || l.kind === e.tipo)
        .map((l) => ({ id: l.id, tipo: l.kind, descricao: l.description, valor: l.amount, categoria: l.category, data: l.occurred_on }));
      return { resultado: { mes, ...resumoDoMes(f, mes), lancamentos: lista }, resumo: `Listou ${lista.length} lançamentos de ${mes}` };
    },
  }),

  ferramenta({
    nome: "registrar_lancamento",
    descricao: "Registra uma entrada ou saída de dinheiro que já aconteceu (um gasto, um recebimento avulso). Para quitar conta fixa ou parcela, use quitar_vencimento.",
    esquema: z.object({
      tipo: z.enum(["receita", "despesa"]),
      descricao: z.string().min(1).max(200),
      valor: z.number().positive().max(100_000_000),
      categoria: z.string().max(60).optional().describe("Ex.: Mercado, Transporte, Saúde, Lazer, Contas, Moradia, Educação, Salário, Extra, Outros."),
      data: dataISO.optional().describe("Padrão: hoje."),
    }),
    async executar(e, c) {
      const amb = financeiro(c);
      const r = await c.supabase
        .from("fin_transactions")
        .insert({
          workspace_id: amb.id,
          kind: e.tipo,
          description: e.descricao.trim(),
          amount: Math.round(e.valor * 100) / 100,
          category: e.categoria?.trim() || "Outros",
          occurred_on: e.data ?? c.hoje,
        })
        .select("id, kind, description, amount, category, occurred_on")
        .single();
      if (r.error || !r.data) throw new Error("Falha ao registrar o lançamento: " + (r.error?.message ?? "sem resposta"));
      return { resultado: r.data, resumo: `Lançou ${e.tipo} de R$ ${e.valor.toFixed(2)}: ${e.descricao.trim()}` };
    },
  }),

  ferramenta({
    nome: "listar_vencimentos",
    descricao: "Lista as contas fixas e parcelas de um mês, dizendo quais já foram pagas ou recebidas.",
    esquema: z.object({ mes: mesISO.optional().describe("Padrão: mês atual.") }),
    async executar(e, c) {
      financeiro(c);
      const f = await carregarFinancas(c.supabase);
      const mes = e.mes ?? mesDe(c.hoje);
      const lista = compromissosDoMes(f, mes).map((x) => ({
        origem: x.origem,
        id: x.id,
        tipo: x.tipo,
        descricao: x.descricao,
        valor: x.valor,
        vencimento: x.vencimento,
        parcela: x.numero ? `${x.numero}/${x.total}` : null,
        quitado: Boolean(x.lancamentoId),
      }));
      return { resultado: { hoje: c.hoje, mes, vencimentos: lista }, resumo: `Consultou os vencimentos de ${mes}` };
    },
  }),

  ferramenta({
    nome: "quitar_vencimento",
    descricao: "Marca uma conta fixa ou parcela de um mês como paga (ou recebida), criando o lançamento com a data de hoje. Pegue origem e id em listar_vencimentos. Só use quando o usuário disser que pagou ou recebeu.",
    esquema: z.object({ origem: z.enum(["fixa", "parcela"]), id: z.uuid(), mes: mesISO }),
    async executar(e, c) {
      const amb = financeiro(c);
      const f = await carregarFinancas(c.supabase);
      const alvo = compromissosDoMes(f, e.mes).find((x) => x.origem === e.origem && x.id === e.id);
      if (!alvo) throw new Error("Não encontrei esse vencimento no mês informado.");
      if (alvo.lancamentoId) return { resultado: { ja_estava_quitado: true }, resumo: `${alvo.descricao} já estava quitado` };
      const r = await c.supabase.from("fin_transactions").insert({
        workspace_id: amb.id,
        kind: alvo.tipo,
        description: alvo.numero ? `${alvo.descricao} (${alvo.numero}/${alvo.total})` : alvo.descricao,
        amount: alvo.valor,
        category: alvo.categoria,
        occurred_on: c.hoje,
        ...(alvo.origem === "fixa" ? { recurring_id: alvo.id, ref_month: e.mes } : { installment_id: alvo.id, installment_number: alvo.numero }),
      });
      if (r.error) throw new Error("Falha ao quitar: " + r.error.message);
      return { resultado: { quitado: true, descricao: alvo.descricao, valor: alvo.valor }, resumo: `Quitou ${alvo.descricao} de ${e.mes}` };
    },
  }),

  ferramenta({
    nome: "simular_compra",
    descricao:
      "Simula uma compra à vista ou parcelada sem gravar nada: valor da parcela, total com juros, percentual da renda comprometida antes e depois, e o saldo projetado mês a mês com e sem a compra. Use para 'posso assumir uma nova parcela?'. Apresente os números e deixe a decisão com o usuário.",
    esquema: z.object({
      valor: z.number().positive().max(100_000_000),
      parcelas: z.number().int().min(1).max(120),
      juros_mensal_pct: z.number().min(0).max(30).optional().describe("Juros ao mês, em %. Padrão: 0 (sem juros)."),
    }),
    async executar(e, c) {
      financeiro(c);
      const f = await carregarFinancas(c.supabase);
      const s = simularCompra(f, c.hoje, e.valor, e.parcelas, e.juros_mensal_pct ?? 0);
      return {
        resultado: {
          parcela: s.parcela,
          total_pago: s.totalPago,
          juros: s.juros,
          primeira_parcela_em: mesDe(s.primeiroVencimento),
          renda_fixa_mensal: s.rendaFixa,
          renda_comprometida_antes: s.comprometimentoAntes,
          renda_comprometida_depois: s.comprometimentoDepois,
          menor_saldo_projetado: s.menorSaldo,
          primeiro_mes_com_saldo_negativo: s.primeiroMesNegativo,
          saldo_fim_de_mes: s.comCompra.map((m, i) => ({ mes: m.mes, sem_a_compra: s.semCompra[i].saldoFinal, com_a_compra: m.saldoFinal })),
          observacao: "A projeção usa só o que está cadastrado mais a estimativa de despesas avulsas. Nada foi gravado.",
        },
        resumo: `Simulou compra de R$ ${e.valor.toFixed(2)} em ${e.parcelas}x`,
      };
    },
  }),
];
