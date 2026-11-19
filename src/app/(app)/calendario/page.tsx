import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { campo, campoTexto, Enviar, Excluir } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { addDias, ehDataISO, fmtData, fmtHora, hojeISO, segundaDe } from "@/lib/datas";
import type { Evento } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { listarEventos, listarTarefas } from "@/modules/dados";
import { atualizarEvento, criarEvento, excluirEvento } from "@/modules/eventos/actions";
import { idsEmConflito } from "@/modules/inteligencia/alertas";
import { TarefaItem } from "@/modules/tarefas/tarefa-item";

export const metadata: Metadata = { title: "Calendário" };

const botaoNav = "grid size-8 place-content-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground";

export default async function Calendario({ searchParams }: PageProps<"/calendario">) {
  const c = await getContexto();
  const sp = await searchParams;
  const hoje = hojeISO();
  const inicio = segundaDe(ehDataISO(sp.semana) ? sp.semana : hoje);
  const dias = Array.from({ length: 7 }, (_, i) => addDias(inicio, i));
  const [eventos, tarefas] = await Promise.all([listarEventos(c, dias[0], dias[6]), listarTarefas(c)]);
  const emConflito = idsEmConflito(eventos);
  const naSemanaAtual = inicio === segundaDe(hoje);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader titulo="Calendário" descricao="Compromissos e tarefas com prazo, dia a dia." />
        <nav aria-label="Semana" className="flex items-center gap-2">
          {!naSemanaAtual && (
            <Link href="/calendario" className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Esta semana
            </Link>
          )}
          <Link href={`/calendario?semana=${addDias(inicio, -7)}`} aria-label="Semana anterior" className={botaoNav}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="min-w-36 text-center font-mono text-sm tabular-nums">
            {fmtData(dias[0])} – {fmtData(dias[6])}
          </span>
          <Link href={`/calendario?semana=${addDias(inicio, 7)}`} aria-label="Próxima semana" className={botaoNav}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      </div>

      <Card>
        <CardContent>
          <form action={criarEvento} className="flex flex-wrap gap-2">
            <input
              className={cn(campo, "flex-[1_1_240px]")}
              name="title"
              placeholder="Novo compromisso (ex.: consulta sexta 14h30)"
              aria-label="Novo compromisso"
              autoComplete="off"
              required
            />
            <input className={campo} type="date" name="event_date" defaultValue={naSemanaAtual ? hoje : dias[0]} aria-label="Data" title="Data" />
            <input className={campo} type="time" name="start_time" aria-label="Início" title="Início" />
            <input className={campo} type="time" name="end_time" aria-label="Fim" title="Fim" />
            <select className={campo} name="workspace_id" defaultValue={c.atual?.id ?? c.ambientes[0].id} aria-label="Ambiente">
              {c.ambientes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Enviar enviando="Criando…">Adicionar</Enviar>
            <p className="basis-full text-xs text-muted-foreground">Data e hora escritas no nome valem sobre os campos. Sem horário, o compromisso vale para o dia todo.</p>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2.5">
        {dias.map((d) => {
          const doDia = eventos.filter((e) => e.event_date === d);
          const tarefasDoDia = tarefas.filter((t) => t.due_date === d && !t.parent_id);
          const ehHoje = d === hoje;
          const [semana, numero, mes] = [fmtData(d, "semana").split(",")[0], d.slice(8), fmtData(d).split(" ").pop()];
          return (
            <section
              key={d}
              aria-label={fmtData(d, "longa")}
              className={cn("grid gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 md:grid-cols-[84px_minmax(0,1fr)]", ehHoje && "border-warning")}
            >
              <div className="flex items-baseline gap-2 md:flex-col md:gap-0.5">
                <span className={cn("text-xs font-semibold tracking-widest text-muted-foreground uppercase", ehHoje && "text-warning")}>{ehHoje ? "hoje" : semana}</span>
                <b className="font-heading text-2xl leading-none tabular-nums">{numero}</b>
                <span className="text-xs text-muted-foreground">{mes}</span>
              </div>
              <div className="min-w-0">
                {doDia.length === 0 && tarefasDoDia.length === 0 && <p className="text-sm text-muted-foreground">Livre</p>}
                {doDia.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {doDia.map((e) => (
                      <EventoItem key={e.id} e={e} conflito={emConflito.has(e.id)} ambiente={c.atual ? "" : nomeDoAmbiente(c, e.workspace_id)} />
                    ))}
                  </ul>
                )}
                {tarefasDoDia.length > 0 && (
                  <ul className={cn("divide-y divide-border", doDia.length > 0 && "mt-2 border-t border-border")}>
                    {tarefasDoDia.map((t) => (
                      <TarefaItem key={t.id} t={t} hoje={hoje} contexto="tarefa" editavel={false} />
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function EventoItem({ e, conflito, ambiente }: { e: Evento; conflito: boolean; ambiente: string }) {
  const horario = e.start_time ? fmtHora(e.start_time) + (e.end_time ? "–" + fmtHora(e.end_time) : "") : "dia todo";
  return (
    <li>
      <div className="flex items-start gap-3">
        <span className="w-24 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{horario}</span>
        <div className="min-w-0 flex-1">
          <p className="[overflow-wrap:anywhere]">{e.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {conflito && <Badge className="bg-destructive/10 text-destructive">conflito de horário</Badge>}
            {e.location && <span>{e.location}</span>}
            {ambiente && <span>{ambiente}</span>}
          </div>
        </div>
        <form action={excluirEvento}>
          <input type="hidden" name="id" value={e.id} />
          <Excluir rotulo={`Excluir: ${e.title}`} />
        </form>
      </div>
      <details className="mt-1 ml-27">
        <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Editar</summary>
        <form action={atualizarEvento} className="mt-2 flex flex-wrap gap-2 rounded-lg border border-border p-3">
          <input type="hidden" name="id" value={e.id} />
          <input className={cn(campo, "flex-[1_1_220px]")} name="title" defaultValue={e.title} aria-label="Nome" required />
          <input className={campo} type="date" name="event_date" defaultValue={e.event_date} aria-label="Data" title="Data" required />
          <input className={campo} type="time" name="start_time" defaultValue={fmtHora(e.start_time)} aria-label="Início" title="Início" />
          <input className={campo} type="time" name="end_time" defaultValue={fmtHora(e.end_time)} aria-label="Fim" title="Fim" />
          <input className={cn(campo, "flex-[1_1_160px]")} name="location" defaultValue={e.location} placeholder="Local" aria-label="Local" />
          <textarea className={campoTexto} name="notes" defaultValue={e.notes} placeholder="Anotações" aria-label="Anotações" />
          <Enviar size="sm">Salvar</Enviar>
        </form>
      </details>
    </li>
  );
}
