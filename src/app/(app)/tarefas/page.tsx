import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-parts";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { addDias, hojeISO } from "@/lib/datas";
import type { Tarefa } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { agruparSubtarefas, listarProjetos, listarTarefas } from "@/modules/dados";
import { NovaTarefa } from "@/modules/tarefas/nova-tarefa";
import { TarefaItem } from "@/modules/tarefas/tarefa-item";

export const metadata: Metadata = { title: "Tarefas" };

export default async function Tarefas({ searchParams }: PageProps<"/tarefas">) {
  const c = await getContexto();
  const concluidas = (await searchParams).aba === "concluidas";
  const [todas, projetos] = await Promise.all([listarTarefas(c), listarProjetos(c)]);
  const hoje = hojeISO();
  const { principais, filhas } = agruparSubtarefas(todas);
  const nomeProjeto = new Map(projetos.map((p) => [p.id, p.name]));

  const abertas = principais.filter((t) => t.status === "aberta");
  const feitas = principais.filter((t) => t.status === "concluida").sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  const amanha = addDias(hoje, 1);
  const semana = addDias(hoje, 7);
  const grupos: [string, (t: Tarefa) => boolean][] = [
    ["Atrasadas", (t) => t.due_date !== null && t.due_date < hoje],
    ["Hoje", (t) => t.due_date === hoje],
    ["Amanhã", (t) => t.due_date === amanha],
    ["Próximos 7 dias", (t) => t.due_date !== null && t.due_date > amanha && t.due_date <= semana],
    ["Mais adiante", (t) => t.due_date !== null && t.due_date > semana],
    ["Sem prazo", (t) => t.due_date === null],
  ];

  const contexto = (t: Tarefa) =>
    [t.project_id ? nomeProjeto.get(t.project_id) : "", c.atual ? "" : nomeDoAmbiente(c, t.workspace_id)].filter(Boolean).join(" · ");
  const item = (t: Tarefa) => <TarefaItem key={t.id} t={t} subtarefas={filhas.get(t.id)} hoje={hoje} contexto={contexto(t)} />;

  const aba = (href: string, rotulo: string, ativa: boolean) => (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", ativa && "bg-card text-foreground shadow-xs")}
    >
      {rotulo}
    </Link>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader titulo="Tarefas" descricao={`${abertas.length} em aberto · ${feitas.length} concluídas`} />
        <nav aria-label="Filtro" className="flex gap-1 rounded-lg bg-muted p-1">
          {aba("/tarefas", "Abertas", !concluidas)}
          {aba("/tarefas?aba=concluidas", "Concluídas", concluidas)}
        </nav>
      </div>

      <Card>
        <CardContent>
          <NovaTarefa ambientes={c.ambientes} ambientePadrao={c.atual?.id} />
        </CardContent>
      </Card>

      {concluidas ? (
        feitas.length ? (
          <Card>
            <CardContent>
              <ul className="divide-y divide-border">{feitas.map(item)}</ul>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">Nenhuma tarefa concluída ainda.</p>
        )
      ) : abertas.length ? (
        grupos.map(([nome, filtro]) => {
          const lista = abertas.filter(filtro);
          if (!lista.length) return null;
          return (
            <Card key={nome}>
              <CardContent>
                <div className="mb-1 flex items-center justify-between">
                  <h2 className={cn("text-base font-bold", nome === "Atrasadas" && "text-destructive")}>{nome}</h2>
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">{lista.length}</span>
                </div>
                <ul className="divide-y divide-border">{lista.map(item)}</ul>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          Nada pendente{c.atual ? ` em ${c.atual.name}` : ""}. Anote a próxima coisa a fazer no campo acima.
        </p>
      )}
    </>
  );
}
