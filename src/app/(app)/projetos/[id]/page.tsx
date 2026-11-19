import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { campo, campoTexto, Enviar, Excluir } from "@/components/app/form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { fmtData, hojeISO } from "@/lib/datas";
import { ROTULO_MEMORIA, ROTULO_STATUS_PROJETO, type Memoria, type Projeto, type Tarefa } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { agruparSubtarefas } from "@/modules/dados";
import { atualizarProjeto, excluirProjeto } from "@/modules/projetos/actions";
import { NovaTarefa } from "@/modules/tarefas/nova-tarefa";
import { TarefaItem } from "@/modules/tarefas/tarefa-item";

export const metadata: Metadata = { title: "Projeto" };

export default async function ProjetoPagina({ params }: PageProps<"/projetos/[id]">) {
  const { id } = await params;
  const c = await getContexto();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [proj, tar, mem] = await Promise.all([
    c.supabase.from("projects").select("id, workspace_id, name, description, status, priority, due_date, last_activity_at, created_at").eq("id", id).maybeSingle(),
    c.supabase
      .from("tasks")
      .select("id, workspace_id, project_id, parent_id, title, notes, status, priority, due_date, done_at, created_at")
      .eq("project_id", id)
      .order("due_date", { nullsFirst: false })
      .order("created_at"),
    c.supabase.from("memories").select("id, workspace_id, project_id, kind, content, source, created_at, updated_at").eq("project_id", id).order("updated_at", { ascending: false }),
  ]);
  if (proj.error || tar.error || mem.error) throw new Error("Não foi possível carregar o projeto.");
  if (!proj.data) notFound();

  const p = proj.data as Projeto;
  const hoje = hojeISO();
  const { principais, filhas } = agruparSubtarefas((tar.data ?? []) as Tarefa[]);
  const abertas = principais.filter((t) => t.status === "aberta");
  const feitas = principais.filter((t) => t.status === "concluida");
  const memorias = (mem.data ?? []) as Memoria[];

  return (
    <>
      <Link href="/projetos" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Projetos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold [overflow-wrap:anywhere]">{p.name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span>{nomeDoAmbiente(c, p.workspace_id)}</span>
            {p.due_date && <span>prazo {fmtData(p.due_date, "semana")}</span>}
            <span>
              {feitas.length}/{principais.length} tarefas concluídas
            </span>
          </p>
        </div>
        <Badge variant="secondary">{ROTULO_STATUS_PROJETO[p.status]}</Badge>
      </header>

      {p.description && <p className="max-w-prose whitespace-pre-wrap text-muted-foreground">{p.description}</p>}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">Tarefas do projeto</h2>
          <NovaTarefa ambientes={[]} projetoId={p.id} />
          {principais.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma tarefa neste projeto ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {[...abertas, ...feitas].map((t) => (
                <TarefaItem key={t.id} t={t} subtarefas={filhas.get(t.id)} hoje={hoje} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">Memória do projeto</h2>
            <Link href="/memoria" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Abrir memória
            </Link>
          </div>
          {memorias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada registrado. Decisões e fatos ligados a este projeto aparecem aqui quando você ou o agente os salvarem.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {memorias.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-sm">
                  <Badge variant="secondary">{ROTULO_MEMORIA[m.kind]}</Badge>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{m.content}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">Dados do projeto</h2>
          <form action={atualizarProjeto} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={p.id} />
            <input className={cn(campo, "flex-[1_1_240px]")} name="name" defaultValue={p.name} aria-label="Nome" required />
            <input className={campo} type="date" name="due_date" defaultValue={p.due_date ?? ""} aria-label="Prazo" title="Prazo" />
            <select className={campo} name="status" defaultValue={p.status} aria-label="Situação">
              {Object.entries(ROTULO_STATUS_PROJETO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <select className={campo} name="priority" defaultValue={p.priority} aria-label="Prioridade">
              <option value="media">Prioridade normal</option>
              <option value="alta">Prioridade alta</option>
              <option value="baixa">Prioridade baixa</option>
            </select>
            <textarea className={campoTexto} name="description" defaultValue={p.description} placeholder="Descrição, objetivo, responsáveis" aria-label="Descrição" />
            <Enviar>Salvar</Enviar>
          </form>
          <form action={excluirProjeto} className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <input type="hidden" name="id" value={p.id} />
            <Excluir rotulo="Excluir projeto" />
            <span>Excluir o projeto apaga também as tarefas e memórias ligadas a ele.</span>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
