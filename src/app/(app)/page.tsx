import { ArrowUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { agenteConfigurado } from "@/agent/provedor";
import { campo } from "@/components/app/form";
import { Saudacao } from "@/components/app/saudacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { addDias, fmtHora, hojeISO, quando } from "@/lib/datas";
import { brl } from "@/lib/dinheiro";
import type { Auditoria } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { AcoesPendentes } from "@/modules/agente/pendentes";
import { agruparSubtarefas, listarAcoesPendentes, listarAtividade, listarEventos, listarProjetos, listarTarefas } from "@/modules/dados";
import { alertasFinanceiros, livreAteRecebimento, type Financas } from "@/modules/financeiro/calculos";
import { carregarFinancas } from "@/modules/financeiro/dados";
import { gerarAlertas } from "@/modules/inteligencia/alertas";
import { listarRegistros } from "@/modules/registros/dados";
import { alertasDeRegistros, KINDS_COM_ALERTA, type Registro } from "@/modules/registros/nucleo";
import { NovaTarefa } from "@/modules/tarefas/nova-tarefa";
import { TarefaItem } from "@/modules/tarefas/tarefa-item";

const TABELA: Record<string, [string, "a" | "o"]> = {
  tasks: ["Tarefa", "a"],
  projects: ["Projeto", "o"],
  events: ["Compromisso", "o"],
  memories: ["Memória", "a"],
  records: ["Registro", "o"],
  fin_transactions: ["Lançamento", "o"],
  fin_recurring: ["Conta fixa", "a"],
  fin_installments: ["Parcelamento", "o"],
  fin_goals: ["Meta financeira", "a"],
};
function descreverAtividade(a: Auditoria) {
  const [nome, g] = TABELA[a.table_name] ?? ["Registro", "o"];
  const verbo = a.action === "insert" ? `criad${g}` : a.action === "delete" ? `excluíd${g}` : `alterad${g}`;
  return `${nome} ${verbo}`;
}

function Titulo({ children, href, link }: { children: React.ReactNode; href?: string; link?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {href && (
        <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {link}
        </Link>
      )}
    </div>
  );
}
const vazio = "text-sm text-muted-foreground";

export default async function Inicio() {
  const c = await getContexto();
  const hoje = hojeISO();
  // A visão geral mostra todos os ambientes, lado a lado, mesmo com um deles selecionado.
  const geral = { ...c, atual: null };
  const [tarefas, projetos, eventos, atividade, pendentes, todasTarefas, todosProjetos, todosEventos] = await Promise.all([
    listarTarefas(c),
    listarProjetos(c),
    listarEventos(c, hoje, addDias(hoje, 7)),
    listarAtividade(c, 8),
    listarAcoesPendentes(c),
    c.atual ? listarTarefas(geral) : null,
    c.atual ? listarProjetos(geral) : null,
    c.atual ? listarEventos(geral, hoje, addDias(hoje, 7)) : null,
  ]);

  // As finanças aparecem no painel geral e no do ambiente Financeiro, nunca nos outros.
  const mostraFinancas = !c.atual || c.atual.slug === "financeiro";
  let financas: Financas | null = null;
  if (mostraFinancas) {
    try {
      financas = await carregarFinancas(c.supabase);
    } catch {
      financas = null; // tabelas financeiras ainda não criadas no Supabase
    }
  }
  const livre = financas ? livreAteRecebimento(financas, hoje) : null;
  // Prazos dos módulos (provas, inscrições, encontros, aniversários...), só dos ambientes à vista.
  let registros: Registro[] = [];
  try {
    registros = await listarRegistros(c.supabase, KINDS_COM_ALERTA, { comData: true });
  } catch {
    registros = []; // tabela dos módulos ainda não criada no Supabase
  }
  const alertas = [
    ...gerarAlertas({ tarefas, projetos, eventos, hoje }),
    ...(financas ? alertasFinanceiros(financas, hoje) : []),
    ...alertasDeRegistros(registros, hoje, c.atual ? new Set([c.atual.id]) : undefined),
  ];
  const { principais, filhas } = agruparSubtarefas(tarefas);
  const peso = { alta: 0, media: 1, baixa: 2 };
  const prioritarias = principais
    .filter((t) => t.status === "aberta" && ((t.due_date !== null && t.due_date <= hoje) || t.priority === "alta"))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || peso[a.priority] - peso[b.priority])
    .slice(0, 8);
  const ativos = projetos.filter((p) => p.status === "ativo").slice(0, 5);
  const nomeProjeto = new Map(projetos.map((p) => [p.id, p.name]));
  const proximos = eventos.slice(0, 7);

  const tg = todasTarefas ?? tarefas;
  const pg = todosProjetos ?? projetos;
  const eg = todosEventos ?? eventos;

  return (
    <>
      {/* Abertura do painel: saudação e conversa com o agente sobre o gradiente da paleta. */}
      <section className="hero flex flex-col gap-5 rounded-3xl px-5 py-6 md:px-8 md:py-8">
        <Saudacao />
        {agenteConfigurado() ? (
          <form action="/agente" className="flex items-center gap-2 rounded-2xl border border-white/25 bg-white/12 p-1.5 backdrop-blur-sm">
            <input
              className={cn(campo, "h-10 flex-1 border-0 bg-transparent text-white focus-visible:ring-0")}
              name="q"
              placeholder="Pergunte ou peça algo ao agente…"
              aria-label="Mensagem para o agente"
              autoComplete="off"
              required
            />
            <Button type="submit" size="icon" aria-label="Abrir conversa com o agente" className="bg-white text-[var(--hero-b)] hover:bg-white/90">
              <ArrowUp aria-hidden />
            </Button>
          </form>
        ) : (
          <p className="w-fit rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm">
            O agente ainda não está ativo: falta a chave de IA.{" "}
            <Link href="/configuracoes" className="font-semibold underline underline-offset-4">
              Ver o que falta
            </Link>
          </p>
        )}
      </section>

      <AcoesPendentes acoes={pendentes} />

      {alertas.length > 0 && (
        <Card>
          <CardContent>
            <Titulo href="/relatorios" link="Relatórios">
              Alertas
            </Titulo>
            <ul className="flex flex-col gap-2.5">
              {alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", a.grave ? "text-destructive" : "text-warning")} aria-hidden />
                  <div className="min-w-0">
                    <Link href={a.href} className="font-medium underline-offset-4 hover:underline">
                      {a.titulo}
                    </Link>
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{a.detalhe}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <Titulo href="/tarefas" link="Todas">
              Tarefas prioritárias
            </Titulo>
            <NovaTarefa ambientes={c.ambientes} ambientePadrao={c.atual?.id} hojePadrao compacto />
            {prioritarias.length ? (
              <ul className="divide-y divide-border">
                {prioritarias.map((t) => (
                  <TarefaItem
                    key={t.id}
                    t={t}
                    subtarefas={filhas.get(t.id)}
                    hoje={hoje}
                    contexto={[t.project_id ? nomeProjeto.get(t.project_id) : "", c.atual ? "" : nomeDoAmbiente(c, t.workspace_id)].filter(Boolean).join(" · ")}
                    editavel={false}
                  />
                ))}
              </ul>
            ) : (
              <p className={vazio}>Nada para hoje, nada atrasado e nenhuma tarefa de prioridade alta.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Titulo href="/calendario" link="Calendário">
              Próximos compromissos
            </Titulo>
            {proximos.length ? (
              <ul className="flex flex-col gap-2.5">
                {proximos.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-28 shrink-0 font-mono text-xs leading-6 text-muted-foreground tabular-nums">
                      {quando(e.event_date, hoje)} {fmtHora(e.start_time)}
                    </span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {e.title}
                      {!c.atual && <span className="text-xs text-muted-foreground"> · {nomeDoAmbiente(c, e.workspace_id)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={vazio}>Nenhum compromisso nos próximos 7 dias.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Titulo href="/projetos" link="Todos">
              Projetos em andamento
            </Titulo>
            {ativos.length ? (
              <ul className="flex flex-col gap-3">
                {ativos.map((p) => {
                  const doProjeto = tarefas.filter((t) => t.project_id === p.id);
                  const feitas = doProjeto.filter((t) => t.status === "concluida").length;
                  const pct = doProjeto.length ? Math.round((feitas / doProjeto.length) * 100) : 0;
                  return (
                    <li key={p.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <Link href={`/projetos/${p.id}`} className="min-w-0 font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                          {p.name}
                        </Link>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                          {doProjeto.length ? `${feitas}/${doProjeto.length}` : "sem tarefas"}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={vazio}>Nenhum projeto ativo.</p>
            )}
          </CardContent>
        </Card>

        {financas && livre && (
          <Card>
            <CardContent>
              <Titulo href="/financeiro" link="Financeiro">
                Resumo financeiro
              </Titulo>
              {financas.config || financas.lancamentos.length || financas.fixas.length ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Saldo hoje</dt>
                    <dd className={cn("font-mono text-xl tabular-nums", livre.saldo < 0 && "text-destructive")}>{brl(livre.saldo)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Livre até {quando(livre.ate, hoje)}</dt>
                    <dd className={cn("font-mono text-xl tabular-nums", livre.livre < 0 ? "text-destructive" : "text-success")}>{brl(livre.livre)}</dd>
                  </div>
                  <p className="col-span-2 text-sm text-muted-foreground">
                    {livre.comprometido.length
                      ? `${livre.comprometido.length} ${livre.comprometido.length === 1 ? "conta" : "contas"} (${brl(livre.totalComprometido)}) ${livre.comprometido.length === 1 ? "vence" : "vencem"} antes disso.`
                      : "Nenhuma conta cadastrada vence antes disso."}
                    {!financas.config && " O saldo inicial ainda não foi informado."}
                  </p>
                </dl>
              ) : (
                <p className={vazio}>
                  Nada cadastrado ainda. Informe seu saldo e suas contas fixas no módulo Financeiro para ver aqui quanto está livre.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Titulo>Atividade recente</Titulo>
            {atividade.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {atividade.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted-foreground tabular-nums">{quando(hojeISO(new Date(a.at)), hoje).slice(0, 10)}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="text-muted-foreground">{descreverAtividade(a)}:</span> {a.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={vazio}>Nada registrado ainda. Cada criação, alteração e exclusão aparece aqui.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="visao-geral">
        <h2 id="visao-geral" className="text-lg font-bold">
          Visão geral da minha vida
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">Cada ambiente com seus próprios números, sem misturar dados.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {c.ambientes.map((a) => {
            const abertas = tg.filter((t) => t.workspace_id === a.id && t.status === "aberta" && !t.parent_id);
            const atrasadas = abertas.filter((t) => t.due_date !== null && t.due_date < hoje).length;
            const proj = pg.filter((p) => p.workspace_id === a.id && p.status === "ativo").length;
            const comp = eg.filter((e) => e.workspace_id === a.id).length;
            return (
              <div key={a.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="font-heading font-bold">{a.name}</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Tarefas abertas</dt>
                  <dd className="text-right font-mono tabular-nums">{abertas.length}</dd>
                  <dt className={cn("text-muted-foreground", atrasadas > 0 && "text-destructive")}>Atrasadas</dt>
                  <dd className={cn("text-right font-mono tabular-nums", atrasadas > 0 && "text-destructive")}>{atrasadas}</dd>
                  <dt className="text-muted-foreground">Projetos ativos</dt>
                  <dd className="text-right font-mono tabular-nums">{proj}</dd>
                  <dt className="text-muted-foreground">Compromissos (7 dias)</dt>
                  <dd className="text-right font-mono tabular-nums">{comp}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
