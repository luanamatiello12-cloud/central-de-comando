import type { Metadata } from "next";
import Link from "next/link";
import { campo, Enviar } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { diasEntre, fmtData, hojeISO } from "@/lib/datas";
import { ROTULO_STATUS_PROJETO } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { listarProjetos, listarTarefas } from "@/modules/dados";
import { criarProjeto } from "@/modules/projetos/actions";

export const metadata: Metadata = { title: "Projetos" };

export default async function Projetos() {
  const c = await getContexto();
  const [projetos, tarefas] = await Promise.all([listarProjetos(c), listarTarefas(c)]);
  const hoje = hojeISO();
  const ordem = { ativo: 0, pausado: 1, concluido: 2, arquivado: 3 };
  const lista = [...projetos].sort((a, b) => ordem[a.status] - ordem[b.status]);

  return (
    <>
      <PageHeader titulo="Projetos" descricao="Tudo o que você acompanha, com andamento e última movimentação." />

      <Card>
        <CardContent>
          <form action={criarProjeto} className="flex flex-wrap gap-2">
            <input className={cn(campo, "flex-[1_1_220px]")} name="name" placeholder="Nome do novo projeto" aria-label="Nome do projeto" required />
            <input className={campo} type="date" name="due_date" aria-label="Prazo" title="Prazo" />
            <select className={campo} name="priority" defaultValue="media" aria-label="Prioridade">
              <option value="media">Prioridade normal</option>
              <option value="alta">Prioridade alta</option>
              <option value="baixa">Prioridade baixa</option>
            </select>
            <select className={campo} name="workspace_id" defaultValue={c.atual?.id ?? c.ambientes[0].id} aria-label="Ambiente">
              {c.ambientes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Enviar enviando="Criando…">Criar projeto</Enviar>
          </form>
        </CardContent>
      </Card>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          Nenhum projeto{c.atual ? ` em ${c.atual.name}` : ""} ainda. Crie o primeiro no campo acima.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((p) => {
            const doProjeto = tarefas.filter((t) => t.project_id === p.id);
            const feitas = doProjeto.filter((t) => t.status === "concluida").length;
            const pct = doProjeto.length ? Math.round((feitas / doProjeto.length) * 100) : 0;
            const parado = diasEntre(p.last_activity_at.slice(0, 10), hoje);
            const vencido = p.status === "ativo" && p.due_date !== null && p.due_date < hoje;
            return (
              <Card key={p.id} className={cn(p.status !== "ativo" && "opacity-70")}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/projetos/${p.id}`} className="min-w-0 font-heading text-lg font-bold underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                      {p.name}
                    </Link>
                    <Badge variant="secondary">{ROTULO_STATUS_PROJETO[p.status]}</Badge>
                  </div>
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {doProjeto.length ? `${feitas}/${doProjeto.length} tarefas · ${pct}%` : "sem tarefas"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {p.due_date && <span className={cn(vencido && "font-semibold text-destructive")}>prazo {fmtData(p.due_date)}</span>}
                    {p.priority === "alta" && <span className="font-semibold text-destructive">prioridade alta</span>}
                    <span>{parado === 0 ? "movimentado hoje" : `sem movimentação há ${parado} ${parado === 1 ? "dia" : "dias"}`}</span>
                    {!c.atual && <span>{nomeDoAmbiente(c, p.workspace_id)}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
