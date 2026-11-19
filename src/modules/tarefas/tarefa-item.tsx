import { Check } from "lucide-react";
import { campo, campoTexto, Enviar, Excluir } from "@/components/app/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtData, quando } from "@/lib/datas";
import type { Tarefa } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { adiarTarefa, alternarTarefa, atualizarTarefa, criarTarefa, excluirTarefa } from "./actions";

function Marcar({ t, pequeno = false }: { t: Tarefa; pequeno?: boolean }) {
  const feita = t.status === "concluida";
  return (
    <form action={alternarTarefa}>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="concluir" value={feita ? "0" : "1"} />
      <button
        type="submit"
        aria-label={feita ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`}
        className={cn(
          "mt-0.5 grid shrink-0 place-content-center rounded-md border-2 border-input bg-card text-primary-foreground transition-colors hover:border-primary",
          pequeno ? "size-4" : "size-5",
          feita && "border-primary bg-primary",
        )}
      >
        {feita && <Check className={pequeno ? "size-3" : "size-3.5"} strokeWidth={3} aria-hidden />}
      </button>
    </form>
  );
}

export function Prazo({ t, hoje }: { t: Tarefa; hoje: string }) {
  if (!t.due_date) return null;
  if (t.status === "concluida") return <span>{fmtData(t.due_date)}</span>;
  if (t.due_date < hoje) return <Badge className="bg-destructive/10 text-destructive">atrasada · {fmtData(t.due_date)}</Badge>;
  if (t.due_date === hoje) return <Badge className="bg-warning-soft text-warning">hoje</Badge>;
  return <span>{quando(t.due_date, hoje)}</span>;
}

type Props = {
  t: Tarefa;
  subtarefas?: Tarefa[];
  hoje: string;
  /** Texto extra na linha de detalhes: nome do projeto ou do ambiente. */
  contexto?: string;
  editavel?: boolean;
};

export function TarefaItem({ t, subtarefas = [], hoje, contexto, editavel = true }: Props) {
  const feita = t.status === "concluida";
  const vencendo = !feita && t.due_date !== null && t.due_date <= hoje;
  const subFeitas = subtarefas.filter((s) => s.status === "concluida").length;

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <Marcar t={t} />
        <div className="min-w-0 flex-1">
          <p className={cn("[overflow-wrap:anywhere]", feita && "text-muted-foreground line-through")}>{t.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Prazo t={t} hoje={hoje} />
            {t.priority === "alta" && !feita && <Badge className="bg-destructive/10 text-destructive">prioridade alta</Badge>}
            {contexto && <span>{contexto}</span>}
            {subtarefas.length > 0 && (
              <span className="font-mono tabular-nums">
                {subFeitas}/{subtarefas.length} subtarefas
              </span>
            )}
          </div>
        </div>
        {vencendo && (
          <form action={adiarTarefa}>
            <input type="hidden" name="id" value={t.id} />
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" title="Passar para amanhã">
              Amanhã
            </Button>
          </form>
        )}
        <form action={excluirTarefa}>
          <input type="hidden" name="id" value={t.id} />
          <Excluir rotulo={`Excluir: ${t.title}`} />
        </form>
      </div>

      {editavel && (
        <details className="mt-1 ml-8">
          <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Editar e subtarefas</summary>
          <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border p-3">
            <form action={atualizarTarefa} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={t.id} />
              <input className={cn(campo, "flex-[1_1_220px]")} name="title" defaultValue={t.title} aria-label="Título" required />
              <input className={campo} type="date" name="due_date" defaultValue={t.due_date ?? ""} aria-label="Prazo" title="Prazo" />
              <select className={campo} name="priority" defaultValue={t.priority} aria-label="Prioridade">
                <option value="media">Prioridade normal</option>
                <option value="alta">Prioridade alta</option>
                <option value="baixa">Prioridade baixa</option>
              </select>
              <textarea className={campoTexto} name="notes" defaultValue={t.notes} placeholder="Anotações" aria-label="Anotações" />
              <Enviar size="sm">Salvar</Enviar>
            </form>

            {subtarefas.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {subtarefas.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <Marcar t={s} pequeno />
                    <span className={cn("min-w-0 flex-1 [overflow-wrap:anywhere]", s.status === "concluida" && "text-muted-foreground line-through")}>
                      {s.title}
                    </span>
                    <form action={excluirTarefa}>
                      <input type="hidden" name="id" value={s.id} />
                      <Excluir rotulo={`Excluir subtarefa: ${s.title}`} />
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form action={criarTarefa} className="flex gap-2">
              <input type="hidden" name="parent_id" value={t.id} />
              <input className={cn(campo, "flex-1")} name="title" placeholder="Nova subtarefa" aria-label="Nova subtarefa" required />
              <Enviar size="sm" variant="outline" enviando="Criando…">
                Adicionar
              </Enviar>
            </form>
          </div>
        </details>
      )}
    </li>
  );
}
