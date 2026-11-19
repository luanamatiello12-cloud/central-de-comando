// Testa a lógica que não depende de banco nem de IA: leitura de datas em texto
// livre, conflitos de agenda e geração de alertas.
// Uso: npx tsx scripts/testar-logica.ts
import { addDias, diaDaSemana, interpretarTexto, segundaDe } from "../src/lib/datas";
import type { Evento, Projeto, Tarefa } from "../src/lib/tipos";
import { conflitos, gerarAlertas } from "../src/modules/inteligencia/alertas";

let falhas = 0;
function espera(cond: boolean, m: string) {
  console.log((cond ? "  ok  " : "FALHA ") + m);
  if (!cond) falhas++;
}

// Quinta-feira, 19 de novembro de 2026.
const HOJE = "2026-11-19";
espera(diaDaSemana(HOJE) === 4, "19/11/2026 é quinta-feira");
espera(segundaDe(HOJE) === "2026-11-16", "segunda da semana é 16/11");

const casos: [string, string, string, string][] = [
  ["pagar boleto amanhã", "pagar boleto", "2026-11-20", ""],
  ["dentista sexta 14h", "dentista", "2026-11-20", "14:00"],
  ["reunião às 9h30", "reunião", "", "09:30"],
  ["renovar CNH dia 25", "renovar CNH", "2026-11-25", ""],
  ["renovar CNH dia 10", "renovar CNH", "2026-12-10", ""],
  ["aniversário 03/12", "aniversário", "2026-12-03", ""],
  ["viagem 05/01", "viagem", "2027-01-05", ""],
  ["ligar pro banco", "ligar pro banco", "", ""],
  ["consulta na quinta às 15:00", "consulta", "2026-11-26", "15:00"],
  ["comprar 2 pães", "comprar 2 pães", "", ""],
  ["depois de amanhã academia 7h", "academia", "2026-11-21", "07:00"],
  ["entregar relatório 31/02", "entregar relatório 31/02", "", ""],
];
for (const [texto, titulo, data, hora] of casos) {
  const r = interpretarTexto(texto, HOJE);
  espera(r.titulo === titulo && r.data === data && r.hora === hora, `"${texto}" -> ${JSON.stringify(r)}`);
}

const ev = (id: string, d: string, ini: string | null, fim: string | null): Evento => ({
  id,
  workspace_id: "w",
  title: "Evento " + id,
  event_date: d,
  start_time: ini,
  end_time: fim,
  location: "",
  notes: "",
});
const eventos = [
  ev("a", HOJE, "10:00:00", "11:00:00"),
  ev("b", HOJE, "10:30:00", "11:30:00"),
  ev("c", HOJE, "11:00:00", "12:00:00"),
  ev("d", HOJE, null, null),
  ev("e", addDias(HOJE, 1), "10:00:00", null),
  ev("f", addDias(HOJE, 1), "10:45:00", null),
];
const pares = conflitos(eventos).map(([x, y]) => x.id + y.id);
espera(pares.join(",") === "ab,bc,ef", `conflitos: a-b, b-c e e-f (obtido: ${pares.join(",")})`);

const tarefa = (id: string, extra: Partial<Tarefa>): Tarefa => ({
  id,
  workspace_id: "w",
  project_id: null,
  parent_id: null,
  title: "Tarefa " + id,
  notes: "",
  status: "aberta",
  priority: "media",
  due_date: null,
  done_at: null,
  created_at: HOJE + "T12:00:00Z",
  ...extra,
});
const projeto = (id: string, extra: Partial<Projeto>): Projeto => ({
  id,
  workspace_id: "w",
  name: "Projeto " + id,
  description: "",
  status: "ativo",
  priority: "media",
  due_date: null,
  last_activity_at: HOJE + "T12:00:00Z",
  created_at: HOJE + "T12:00:00Z",
  ...extra,
});

const alertas = gerarAlertas({
  hoje: HOJE,
  eventos,
  tarefas: [
    tarefa("1", { due_date: addDias(HOJE, -3) }),
    tarefa("2", { due_date: addDias(HOJE, -1) }),
    tarefa("3", { due_date: addDias(HOJE, 2) }),
    tarefa("4", { due_date: addDias(HOJE, -5), status: "concluida" }),
    tarefa("5", { created_at: addDias(HOJE, -40) + "T12:00:00Z" }),
    tarefa("6", { due_date: HOJE }),
  ],
  projetos: [
    projeto("p1", { last_activity_at: addDias(HOJE, -20) + "T12:00:00Z" }),
    projeto("p2", { due_date: addDias(HOJE, -2) }),
    projeto("p3", { status: "pausado", last_activity_at: addDias(HOJE, -90) + "T12:00:00Z" }),
  ],
});
const tipos = alertas.map((a) => a.tipo);
espera(alertas.find((a) => a.tipo === "atraso")?.titulo === "2 tarefas atrasadas", "conta 2 atrasadas (ignora concluída e a de hoje)");
espera(tipos.filter((t) => t === "conflito").length === 3, "3 conflitos de horário nos próximos 7 dias");
espera(alertas.some((a) => a.titulo === "Projeto sem movimentação: Projeto p1"), "projeto parado há 20 dias gera alerta");
espera(alertas.some((a) => a.titulo === "Projeto com prazo vencido: Projeto p2"), "projeto com prazo vencido gera alerta");
espera(!alertas.some((a) => a.titulo.includes("p3")), "projeto pausado não gera alerta");
espera(alertas.some((a) => a.tipo === "prazo" && a.titulo.startsWith("1 tarefa vence")), "1 tarefa vence nos próximos 3 dias");
espera(alertas.some((a) => a.tipo === "esquecida"), "tarefa sem prazo há 40 dias conta como esquecida");
espera(gerarAlertas({ hoje: HOJE, eventos: [], tarefas: [], projetos: [] }).length === 0, "sem dados, nenhum alerta");

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exitCode = falhas ? 1 : 0;
