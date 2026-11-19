import type { Metadata } from "next";
import Link from "next/link";
import { agenteConfigurado } from "@/agent/provedor";
import { PageHeader } from "@/components/app/page-parts";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto } from "@/lib/contexto";
import { addDias, diasEntre, fmtData, fmtHora, hojeISO, quando, segundaDe } from "@/lib/datas";
import { cn } from "@/lib/utils";
import { listarEventos, listarProjetos, listarTarefas } from "@/modules/dados";
import { gerarAlertas } from "@/modules/inteligencia/alertas";

export const metadata: Metadata = { title: "Relatórios" };

function Numero({ rotulo, valor, alerta = false }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{rotulo}</dt>
      <dd className={cn("font-mono text-2xl tabular-nums", alerta && valor > 0 && "text-destructive")}>{valor}</dd>
    </div>
  );
}

function Lista({ titulo, itens, vazio }: { titulo: string; itens: string[]; vazio: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold">{titulo}</h3>
      {itens.length ? (
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm">
          {itens.map((t, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{vazio}</p>
      )}
    </div>
  );
}

export default async function Relatorios() {
  const c = await getContexto();
  const hoje = hojeISO();
  const segunda = segundaDe(hoje);
  const domingo = addDias(segunda, 6);
  const [tarefas, projetos, eventos] = await Promise.all([listarTarefas(c), listarProjetos(c), listarEventos(c, segunda, addDias(hoje, 7))]);

  const principais = tarefas.filter((t) => !t.parent_id);
  const abertas = principais.filter((t) => t.status === "aberta");
  const diaDe = (iso: string | null) => (iso ? hojeISO(new Date(iso)) : "");

  // Diário
  const paraHoje = abertas.filter((t) => t.due_date === hoje);
  const atrasadas = abertas.filter((t) => t.due_date !== null && t.due_date < hoje);
  const feitasHoje = principais.filter((t) => diaDe(t.done_at) === hoje);
  const agendaHoje = eventos.filter((e) => e.event_date === hoje);
  const alertas = gerarAlertas({ tarefas, projetos, eventos, hoje });

  // Semanal (segunda a domingo)
  const naSemana = (d: string) => d >= segunda && d <= domingo;
  const feitasSemana = principais.filter((t) => t.done_at && naSemana(diaDe(t.done_at)));
  const criadasSemana = principais.filter((t) => naSemana(diaDe(t.created_at)));
  const vencemSemana = abertas.filter((t) => t.due_date !== null && t.due_date >= hoje && t.due_date <= domingo);
  const agendaSemana = eventos.filter((e) => naSemana(e.event_date));
  const movimentados = projetos.filter((p) => p.status === "ativo" && naSemana(diaDe(p.last_activity_at)));
  const parados = projetos.filter((p) => p.status === "ativo" && diasEntre(diaDe(p.last_activity_at), hoje) >= 14);

  const pedido = `Com base nos meus dados, faça um resumo da minha semana (${fmtData(segunda)} a ${fmtData(domingo)}): o que avancei, o que está atrasado e as três prioridades para os próximos dias.`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          titulo="Relatórios"
          descricao={`Calculados agora a partir dos seus dados${c.atual ? ` do ambiente ${c.atual.name}` : ", todos os ambientes"}. Nada aqui é estimado.`}
        />
        {agenteConfigurado() && (
          <Link href={`/agente?q=${encodeURIComponent(pedido)}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            Pedir análise ao agente
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold">Relatório diário</h2>
            <p className="text-sm text-muted-foreground first-letter:uppercase">{fmtData(hoje, "longa")}</p>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Numero rotulo="Para hoje" valor={paraHoje.length} />
            <Numero rotulo="Atrasadas" valor={atrasadas.length} alerta />
            <Numero rotulo="Concluídas hoje" valor={feitasHoje.length} />
            <Numero rotulo="Compromissos" valor={agendaHoje.length} />
          </dl>
          <div className="grid gap-5 md:grid-cols-2">
            <Lista
              titulo="Agenda de hoje"
              itens={agendaHoje.map((e) => `${e.start_time ? fmtHora(e.start_time) : "dia todo"} · ${e.title}`)}
              vazio="Nenhum compromisso hoje."
            />
            <Lista titulo="Tarefas para hoje" itens={paraHoje.map((t) => t.title)} vazio="Nenhuma tarefa com prazo para hoje." />
            <Lista titulo="Atrasadas" itens={atrasadas.map((t) => `${t.title} (era ${fmtData(t.due_date)})`)} vazio="Nada atrasado." />
            <Lista titulo="Alertas" itens={alertas.map((a) => `${a.titulo}. ${a.detalhe}`)} vazio="Nenhum alerta." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold">Relatório semanal</h2>
            <p className="text-sm text-muted-foreground">
              Segunda, {fmtData(segunda)}, a domingo, {fmtData(domingo)}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Numero rotulo="Concluídas" valor={feitasSemana.length} />
            <Numero rotulo="Criadas" valor={criadasSemana.length} />
            <Numero rotulo="Ainda vencem" valor={vencemSemana.length} />
            <Numero rotulo="Compromissos" valor={agendaSemana.length} />
          </dl>
          <div className="grid gap-5 md:grid-cols-2">
            <Lista titulo="Concluídas na semana" itens={feitasSemana.map((t) => t.title)} vazio="Nenhuma tarefa concluída nesta semana." />
            <Lista
              titulo="Vencem até domingo"
              itens={vencemSemana.map((t) => `${t.title} (${quando(t.due_date!, hoje)})`)}
              vazio="Nenhuma tarefa com prazo até domingo."
            />
            <Lista titulo="Projetos movimentados" itens={movimentados.map((p) => p.name)} vazio="Nenhum projeto movimentado nesta semana." />
            <Lista
              titulo="Projetos parados há 14 dias ou mais"
              itens={parados.map((p) => `${p.name} (${diasEntre(diaDe(p.last_activity_at), hoje)} dias)`)}
              vazio="Nenhum projeto parado."
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
