// Testa os cálculos do módulo Financeiro com um cenário fechado, conferido à mão.
// Uso: npx tsx scripts/testar-financeiro.ts
import { brl, lerValor } from "../src/lib/dinheiro";
import {
  alertasFinanceiros,
  compromissosDoMes,
  gastosPorCategoria,
  livreAteRecebimento,
  mediaAvulsa,
  planoDaMeta,
  projetar,
  rendaEFixos,
  saldoEm,
  simularCompra,
  type Financas,
  type Lancamento,
} from "../src/modules/financeiro/calculos";

let falhas = 0;
function espera(cond: boolean, m: string) {
  console.log((cond ? "  ok  " : "FALHA ") + m);
  if (!cond) falhas++;
}

const valores: [string, number | null][] = [
  ["1.234,56", 1234.56],
  ["1234,5", 1234.5],
  ["1234.56", 1234.56],
  ["R$ 80", 80],
  ["12.500", 12500],
  ["3.5", 3.5],
  ["abc", null],
  ["", null],
];
for (const [texto, esperado] of valores) espera(lerValor(texto) === esperado, `lerValor("${texto}") = ${lerValor(texto)}`);
espera(brl(-1234.5) === "−R$ 1.234,50", `brl(-1234.5) = ${brl(-1234.5)}`);

// Quinta-feira, 19 de novembro de 2026.
const HOJE = "2026-11-19";

const lanc = (id: string, extra: Partial<Lancamento>): Lancamento => ({
  id,
  kind: "despesa",
  description: "L" + id,
  amount: 0,
  category: "Outros",
  occurred_on: HOJE,
  recurring_id: null,
  ref_month: null,
  installment_id: null,
  installment_number: null,
  goal_id: null,
  ...extra,
});

// Saldo inicial de 3.000 em 01/11. Em novembro: salário recebido (+5.000),
// aluguel pago (−1.500) e mercado (−400). Saldo hoje: 6.100.
const fin: Financas = {
  config: { opening_balance: 3000, opening_date: "2026-11-01" },
  fixas: [
    { id: "sal", kind: "receita", description: "Salário", amount: 5000, category: "Salário", day_of_month: 5, start_month: "2026-11", active: true },
    { id: "alu", kind: "despesa", description: "Aluguel", amount: 1500, category: "Moradia", day_of_month: 10, start_month: "2026-11", active: true },
    { id: "net", kind: "despesa", description: "Internet", amount: 100, category: "Contas", day_of_month: 25, start_month: "2026-11", active: true },
    { id: "old", kind: "despesa", description: "Cancelada", amount: 999, category: "Outros", day_of_month: 1, start_month: "2026-01", active: false },
  ],
  parcelamentos: [{ id: "note", kind: "parcela", description: "Notebook", category: "Outros", installment_amount: 300, total_installments: 10, first_due: "2026-10-20" }],
  orcamentos: [{ category: "Mercado", monthly_limit: 420 }],
  metas: [{ id: "m1", name: "Reserva", target_amount: 6000, saved_amount: 1500, deadline: "2027-01-31" }],
  lancamentos: [
    lanc("1", { kind: "receita", amount: 5000, occurred_on: "2026-11-05", recurring_id: "sal", ref_month: "2026-11", category: "Salário" }),
    lanc("2", { amount: 1500, occurred_on: "2026-11-10", recurring_id: "alu", ref_month: "2026-11", category: "Moradia" }),
    lanc("3", { amount: 400, occurred_on: "2026-11-12", category: "Mercado" }),
    lanc("4", { amount: 600, occurred_on: "2026-10-10", category: "Lazer" }),
    lanc("5", { amount: 300, occurred_on: "2026-10-20", installment_id: "note", installment_number: 1 }),
  ],
};

espera(saldoEm(fin, HOJE) === 6100, `saldo hoje = 6100 (obtido ${saldoEm(fin, HOJE)}); ignora o que é anterior ao saldo inicial`);

const nov = compromissosDoMes(fin, "2026-11");
espera(
  nov.map((c) => `${c.id}:${c.lancamentoId ? "pago" : "pendente"}`).join(",") === "sal:pago,alu:pago,note:pendente,net:pendente",
  "compromissos de novembro e a situação de cada um",
);
espera(nov.find((c) => c.id === "note")?.numero === 2 && nov.find((c) => c.id === "note")?.vencimento === "2026-11-20", "notebook: parcela 2 de 10, vence dia 20");
espera(compromissosDoMes(fin, "2027-08").every((c) => c.id !== "note"), "parcelamento some depois da 10ª parcela");
espera(
  compromissosDoMes({ ...fin, fixas: [{ ...fin.fixas[2], day_of_month: 31 }] }, "2027-02").find((c) => c.id === "net")?.vencimento === "2027-02-28",
  "dia 31 em fevereiro vira dia 28",
);

const livre = livreAteRecebimento(fin, HOJE);
espera(livre.proximoRecebimento?.vencimento === "2026-12-05", "próximo recebimento: salário em 05/12");
espera(livre.totalComprometido === 400 && livre.livre === 5700, `comprometido 400, livre 5700 (obtido ${livre.totalComprometido}, ${livre.livre})`);
espera(livre.dias === 16 && livre.porDia === 356.25, `16 dias, 356,25 por dia (obtido ${livre.dias}, ${livre.porDia})`);
const semSalario = livreAteRecebimento({ ...fin, fixas: fin.fixas.filter((x) => x.id !== "sal") }, HOJE);
espera(semSalario.proximoRecebimento === null && semSalario.ate === "2026-11-30" && semSalario.totalComprometido === 400, "sem receita fixa, considera até o fim do mês");
const atrasada = livreAteRecebimento({ ...fin, lancamentos: fin.lancamentos.filter((l) => l.id !== "5") }, HOJE);
espera(atrasada.totalComprometido === 700, `parcela vencida no mês passado e não paga continua comprometida (obtido ${atrasada.totalComprometido})`);

const media = mediaAvulsa(fin, HOJE);
espera(media.media === 600 && media.mesesBase === 1, `média avulsa 600 com base em 1 mês (obtido ${media.media}, ${media.mesesBase})`);
const proj = projetar(fin, HOJE, 2);
espera(proj[0].saldoFinal === 5480 && proj[0].avulsasEstimadas === 220, `novembro termina em 5480 (obtido ${proj[0].saldoFinal})`);
espera(proj[1].entradas === 5000 && proj[1].saidas === 1900 && proj[1].saldoFinal === 7980, `dezembro termina em 7980 (obtido ${proj[1].saldoFinal})`);
espera(projetar({ ...fin, lancamentos: [] }, HOJE, 1)[0].avulsasEstimadas === 0, "sem histórico, a estimativa de avulsas é zero");

const rf = rendaEFixos(fin, HOJE);
espera(rf.renda === 5000 && rf.fixos === 1900 && rf.comprometimento === 0.38, "renda fixa 5000, compromissos 1900 (38%)");
const sim = simularCompra(fin, HOJE, 1200, 4);
espera(sim.parcela === 300 && sim.juros === 0 && sim.comprometimentoDepois === 0.44, "1200 em 4x: parcela 300, sem juros, comprometimento vai a 44%");
espera(sim.comCompra[0].saldoFinal === 5480 && sim.comCompra[1].saldoFinal === 7680 && sim.primeiroMesNegativo === null, "primeira parcela cai em dezembro; saldo não fica negativo");
const simJuros = simularCompra(fin, HOJE, 1000, 2, 10);
espera(simJuros.parcela === 576.19 && simJuros.juros === 152.38, `1000 em 2x a 10% ao mês: 576,19 (obtido ${simJuros.parcela}, juros ${simJuros.juros})`);
const simCara = simularCompra(fin, HOJE, 60000, 6);
espera(simCara.primeiroMesNegativo === "2026-12", `60 mil em 6x deixa o saldo negativo já em dezembro (obtido ${simCara.primeiroMesNegativo})`);

const plano = planoDaMeta(fin.metas[0], HOJE);
espera(plano.falta === 4500 && plano.meses === 3 && plano.porMes === 1500 && plano.pct === 25, "meta: faltam 4500 em 3 meses, 1500 por mês");
espera(planoDaMeta({ ...fin.metas[0], deadline: "2026-10-31" }, HOJE).vencida, "meta com prazo passado e incompleta é marcada como vencida");

const cat = gastosPorCategoria(fin, "2026-11");
espera(cat[0].categoria === "Moradia" && cat.find((g) => g.categoria === "Mercado")?.uso === 400 / 420, "gasto por categoria com uso do orçamento");

const af = alertasFinanceiros(fin, HOJE).map((a) => a.titulo);
espera(af.includes("1 conta vence nos próximos 5 dias"), `alerta: notebook vence em 5 dias (obtido: ${af.join(" | ")})`);
espera(af.includes("Orçamento de Mercado quase no limite"), "alerta: orçamento de Mercado em 95%");
espera(!af.some((t) => t.includes("vencida")), "nenhuma conta vencida no cenário base");
espera(
  alertasFinanceiros({ ...fin, config: { opening_balance: -9000, opening_date: "2026-11-01" } }, HOJE).some((a) => a.titulo.startsWith("Saldo projetado fica negativo")),
  "alerta: saldo projetado negativo",
);

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exitCode = falhas ? 1 : 0;
