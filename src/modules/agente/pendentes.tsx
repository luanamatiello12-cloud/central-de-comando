import { Enviar } from "@/components/app/form";
import type { AcaoAgente } from "@/lib/tipos";
import { cancelarAcao, confirmarAcao } from "./actions";

/** Ações sensíveis que o agente pediu e que só acontecem com a confirmação do usuário. */
export function AcoesPendentes({ acoes }: { acoes: AcaoAgente[] }) {
  if (acoes.length === 0) return null;
  return (
    <section aria-label="Ações aguardando confirmação" className="flex flex-col gap-2">
      {acoes.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning bg-warning-soft px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-warning uppercase">O agente pede sua confirmação</p>
            <p className="[overflow-wrap:anywhere]">{a.summary}</p>
          </div>
          <div className="flex gap-2">
            <form action={confirmarAcao}>
              <input type="hidden" name="id" value={a.id} />
              <Enviar size="sm" variant="destructive" enviando="Excluindo…">
                Confirmar exclusão
              </Enviar>
            </form>
            <form action={cancelarAcao}>
              <input type="hidden" name="id" value={a.id} />
              <Enviar size="sm" variant="outline" enviando="Cancelando…">
                Não excluir
              </Enviar>
            </form>
          </div>
        </div>
      ))}
    </section>
  );
}
