import { Check, Circle, LoaderCircle } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MODELO } from "@/agent/provedor";
import { CorPicker } from "@/components/app/cor-picker";
import { Enviar } from "@/components/app/form";
import { IntegracoesCarregando, IntegracoesStatus } from "@/components/app/integracoes-status";
import { PageHeader } from "@/components/app/page-parts";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { fmtData, hojeISO } from "@/lib/datas";
import { ETAPAS } from "@/lib/etapas";
import type { AcaoAgente } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { definirAcessoDoAgente } from "@/modules/conta/actions";

export const metadata: Metadata = { title: "Ajustes" };

const ESTADO_ACAO: Record<AcaoAgente["status"], string> = {
  executada: "executada",
  pendente: "aguardando você",
  confirmada: "confirmada por você",
  cancelada: "cancelada por você",
  erro: "falhou",
};

export default async function Configuracoes() {
  const c = await getContexto();
  const log = await c.supabase
    .from("agent_actions")
    .select("id, conversation_id, workspace_id, tool, input, result, summary, status, created_at")
    .order("created_at", { ascending: false })
    .limit(25);
  if (log.error) throw new Error("Não foi possível carregar o histórico do agente.");
  const acoes = (log.data ?? []) as AcaoAgente[];

  return (
    <>
      <PageHeader titulo="Ajustes" descricao="Aparência, integrações, permissões do agente e histórico do que ele fez." />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Aparência</CardTitle>
          <CardDescription>A cor vale para este navegador. Claro, escuro ou do sistema você troca no botão ao lado.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <CorPicker />
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Integrações</CardTitle>
          <CardDescription>
            As chaves ficam no arquivo .env.local, só no servidor. Esta tela mostra apenas se cada uma está presente. Modelo de IA configurado:{" "}
            <span className="font-mono">{MODELO}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<IntegracoesCarregando />}>
            <IntegracoesStatus comFuturas />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">O que o agente pode acessar</CardTitle>
          <CardDescription>
            Em um ambiente bloqueado, o agente não lê nem escreve nada. Mesmo nos liberados, cada conversa fica no próprio ambiente, a menos que você autorize os outros
            naquela conversa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {c.ambientes.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-muted-foreground">{a.agent_access ? "Liberado para o agente" : "Bloqueado para o agente"}</p>
                </div>
                <form action={definirAcessoDoAgente}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="permitir" value={a.agent_access ? "0" : "1"} />
                  <Enviar size="sm" variant="outline">
                    {a.agent_access ? "Bloquear" : "Liberar"}
                  </Enviar>
                </form>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Histórico do agente</CardTitle>
          <CardDescription>As últimas 25 ferramentas que o agente usou, com o resultado.</CardDescription>
        </CardHeader>
        <CardContent>
          {acoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">O agente ainda não executou nenhuma ação.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {acoes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{fmtData(hojeISO(new Date(a.created_at)))}</span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{a.summary || a.tool}</span>
                  <span className="text-xs text-muted-foreground">{nomeDoAmbiente(c, a.workspace_id)}</span>
                  <Badge variant="secondary" className={cn(a.status === "erro" && "bg-destructive/10 text-destructive", a.status === "pendente" && "bg-warning-soft text-warning")}>
                    {ESTADO_ACAO[a.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Construção do MVP</CardTitle>
          <CardDescription>Estado de cada etapa do plano (docs/PLANO.md).</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {ETAPAS.map((e) => {
              const Icone = e.estado === "concluida" ? Check : e.estado === "em-andamento" ? LoaderCircle : Circle;
              return (
                <li key={e.n} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-content-center rounded-full border border-border text-muted-foreground",
                      e.estado === "concluida" && "border-primary bg-primary text-primary-foreground",
                      e.estado === "em-andamento" && "border-warning text-warning",
                    )}
                  >
                    <Icone className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="font-mono text-sm tabular-nums">{e.n}</span> · {e.nome}
                    </p>
                    <p className="text-sm text-muted-foreground">{e.nota ?? e.entrega}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
