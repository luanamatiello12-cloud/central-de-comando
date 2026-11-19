// Testa a base dos módulos: consistência do esquema, validação de campos,
// datas anuais, alertas, média de notas e sequência de hábitos.
// Uso: npx tsx scripts/testar-modulos.ts
import { ENTIDADES, entidade, MODULOS } from "../src/modules/registros/esquemas";
import {
  alertasDeRegistros,
  alternarDia,
  lerCampos,
  mediaDasAvaliacoes,
  ordenar,
  proximaOcorrencia,
  resumoDoRegistro,
  sequencia,
  statusValido,
  urlSegura,
  type Registro,
} from "../src/modules/registros/nucleo";

let falhas = 0;
function espera(cond: boolean, m: string) {
  console.log((cond ? "  ok  " : "FALHA ") + m);
  if (!cond) falhas++;
}

const HOJE = "2026-11-19";

// ------------------------------------------------------------------ esquema
const kinds = ENTIDADES.map((e) => e.kind);
espera(new Set(kinds).size === kinds.length, `os ${kinds.length} tipos têm identificadores únicos`);
espera(kinds.every((k) => /^[a-z]+\.[a-z_]+$/.test(k)), "todo identificador segue o formato aceito pelo banco");
espera(
  MODULOS.every((m) => m.entidades.every((e) => e.kind.startsWith(m.slug + "."))),
  "cada tipo começa com o nome do seu módulo",
);
const problemas: string[] = [];
for (const e of ENTIDADES) {
  const nomes = e.campos.map((c) => c.nome);
  if (new Set(nomes).size !== nomes.length) problemas.push(`${e.kind}: campo repetido`);
  for (const c of e.campos) if (c.tipo === "select" && !c.opcoes?.length) problemas.push(`${e.kind}.${c.nome}: select sem opções`);
  for (const r of e.resumo ?? []) if (!nomes.includes(r)) problemas.push(`${e.kind}: resumo cita campo inexistente "${r}"`);
  for (const p of e.pai?.kinds ?? []) if (!entidade(p)) problemas.push(`${e.kind}: pai inexistente "${p}"`);
  for (const f of e.filhos ?? []) {
    const filha = entidade(f);
    if (!filha) problemas.push(`${e.kind}: filho inexistente "${f}"`);
    else if (!filha.pai?.kinds.includes(e.kind)) problemas.push(`${e.kind}: "${f}" não aceita este tipo como pai`);
  }
  for (const s of e.finais ?? []) if (!e.status?.includes(s)) problemas.push(`${e.kind}: situação final "${s}" não está na lista`);
  if (e.alerta && !e.data) problemas.push(`${e.kind}: tem alerta mas não tem data`);
  if (e.marcavel && (!e.status || !e.finais)) problemas.push(`${e.kind}: marcável sem situações`);
  if (e.soFilho && !e.pai?.obrigatorio) problemas.push(`${e.kind}: só-filho sem pai obrigatório`);
  if (e.soFilho && !ENTIDADES.some((x) => x.filhos?.includes(e.kind))) problemas.push(`${e.kind}: só-filho que nenhuma tela mostra`);
}
espera(problemas.length === 0, `esquema consistente${problemas.length ? ": " + problemas.join("; ") : ""}`);
espera(MODULOS.map((m) => m.slug).join(",") === "trabalho,ministerio,faculdade,carreira,pessoal,pesquisa", "os seis módulos existem");

// ---------------------------------------------------------------- validação
espera(urlSegura("https://exemplo.gov.br/edital") === "https://exemplo.gov.br/edital", "link https é aceito");
espera(urlSegura("javascript:alert(1)") === null && urlSegura("data:text/html,x") === null && urlSegura("exemplo") === null, "links que não são http(s) são recusados");

const oport = entidade("carreira.oportunidade")!;
const lido = lerCampos(oport, (n) => ({ tipo: "Concurso", salario: "4.500,00", prova: "2026-12-20", link: "https://x.org/a", local: "  Chapecó  " })[n]);
espera(lido.erros.length === 0 && lido.data.salario === 4500 && lido.data.local === "Chapecó" && !("orgao" in lido.data), "campos lidos e limpos; ausentes são ignorados");
const ruim = lerCampos(oport, (n) => ({ tipo: "Estágio", salario: "abc", prova: "2026-02-31", link: "javascript:x" })[n]);
espera(ruim.erros.length === 4, `quatro campos inválidos geram quatro erros (obtido ${ruim.erros.length})`);
espera(lerCampos(oport, (n) => (n === "local" ? "" : undefined)).data.local === null, "campo enviado vazio apaga o valor");
espera(statusValido(oport, "Inscrito") === "Inscrito" && statusValido(oport, "Qualquer") === "Acompanhando", "situação inválida volta para a inicial");

// -------------------------------------------------------------------- datas
espera(proximaOcorrencia("1990-11-19", HOJE) === "2026-11-19", "aniversário hoje conta como hoje");
espera(proximaOcorrencia("1990-11-18", HOJE) === "2027-11-18", "aniversário de ontem vai para o ano que vem");
espera(proximaOcorrencia("1992-02-29", HOJE) === "2027-02-28", "29/02 em ano comum vira 28/02");

const reg = (id: string, kind: string, extra: Partial<Registro>): Registro => ({
  id,
  workspace_id: "w1",
  kind,
  parent_id: null,
  title: "R" + id,
  status: entidade(kind)?.status?.[0] ?? "",
  date: null,
  data: {},
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  ...extra,
});

// ------------------------------------------------------------------ alertas
const registros = [
  reg("1", "faculdade.avaliacao", { title: "Prova de Cálculo", date: "2026-11-22" }),
  reg("2", "faculdade.avaliacao", { title: "Trabalho antigo", date: "2026-11-10" }),
  reg("3", "faculdade.avaliacao", { title: "Já entregue", date: "2026-11-21", status: "Entregue" }),
  reg("4", "pessoal.data", { title: "Aniversário da Ana", date: "1990-11-23" }),
  reg("5", "pessoal.data", { title: "Aniversário passado", date: "1985-11-01" }),
  reg("6", "carreira.oportunidade", { title: "Concurso X", date: "2026-11-24", workspace_id: "w2" }),
  reg("7", "carreira.oportunidade", { title: "Vaga longe", date: "2027-03-01" }),
  reg("8", "ministerio.grupo", { title: "PG Centro" }),
];
const titulos = alertasDeRegistros(registros, HOJE).map((a) => a.titulo);
espera(titulos.includes("Prova ou trabalho: Prova de Cálculo"), "prova em 3 dias gera alerta");
espera(titulos.includes("Prova ou trabalho em atraso: Trabalho antigo"), "trabalho vencido e pendente gera alerta de atraso");
espera(!titulos.some((t) => t.includes("Já entregue")), "avaliação entregue não gera alerta");
espera(titulos.includes("Data importante: Aniversário da Ana") && !titulos.some((t) => t.includes("passado")), "aniversário em 4 dias avisa; o que já passou no ano não");
espera(titulos.includes("Prazo de inscrição: Concurso X"), "prazo de inscrição em 5 dias gera alerta");
espera(alertasDeRegistros(registros, HOJE, new Set(["w1"])).every((a) => !a.titulo.includes("Concurso X")), "alerta de outro ambiente fica de fora quando há filtro");
espera(alertasDeRegistros([], HOJE).length === 0, "sem registros, nenhum alerta");

// ---------------------------------------------------------------- ordenação
const aval = entidade("faculdade.avaliacao")!;
espera(
  ordenar(aval, registros.filter((r) => r.kind === aval.kind), HOJE)
    .map((r) => r.id)
    .join("") === "213",
  "lista: pendentes por data, encerradas no fim",
);
espera(resumoDoRegistro(oport, reg("9", oport.kind, { data: { tipo: "Concurso", orgao: "Prefeitura", salario: 4500 } })).join(" | ") === "Concurso | Prefeitura | salário: R$ 4.500,00", "resumo da linha da lista");

// -------------------------------------------------------------------- notas
const m = mediaDasAvaliacoes([
  reg("a", aval.kind, { data: { nota: 8, peso: 2 } }),
  reg("b", aval.kind, { data: { nota: 15, nota_maxima: 20, peso: 1 } }),
  reg("c", aval.kind, { data: {} }),
]);
espera(m.media === 7.83 && m.comNota === 2 && m.total === 3, `média ponderada 7,83 com 2 de 3 notas (obtido ${m.media})`);
espera(mediaDasAvaliacoes([reg("d", aval.kind, {})]).media === null, "sem notas, não há média");

// ------------------------------------------------------------------ hábitos
const log = { "2026-11-19": true, "2026-11-18": true, "2026-11-17": true, "2026-11-15": true };
espera(sequencia(log, HOJE) === 3, "três dias seguidos até hoje");
espera(sequencia({ "2026-11-18": true, "2026-11-17": true }, HOJE) === 2, "hoje ainda não marcado: conta até ontem");
espera(sequencia({ "2026-11-16": true }, HOJE) === 0, "sequência quebrada vale zero");
const alternado = alternarDia({ ...log, "2025-01-01": true }, "2026-11-19", HOJE);
espera(!alternado["2026-11-19"] && alternado["2026-11-18"] && !alternado["2025-01-01"], "alternar desmarca o dia e descarta histórico com mais de 400 dias");

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exitCode = falhas ? 1 : 0;
