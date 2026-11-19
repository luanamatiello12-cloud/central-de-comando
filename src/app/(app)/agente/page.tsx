import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { agenteConfigurado, MODELO } from "@/agent/provedor";
import { Enviar, Excluir } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-parts";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import type { Conversa, Mensagem } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { definirConsultaCruzada, excluirConversa } from "@/modules/agente/actions";
import { Chat } from "@/modules/agente/chat";
import { AcoesPendentes } from "@/modules/agente/pendentes";
import { listarAcoesPendentes } from "@/modules/dados";

export const metadata: Metadata = { title: "Agente" };

export default async function Agente({ searchParams }: PageProps<"/agente">) {
  const c = await getContexto();
  const sp = await searchParams;
  const idPedido = typeof sp.c === "string" && /^[0-9a-f-]{36}$/i.test(sp.c) ? sp.c : null;
  const rascunho = typeof sp.q === "string" ? sp.q.slice(0, 2000) : "";

  const [conv, pendentes] = await Promise.all([
    c.supabase.from("conversations").select("id, workspace_id, title, allow_cross, updated_at").order("updated_at", { ascending: false }).limit(30),
    listarAcoesPendentes(c),
  ]);
  if (conv.error) throw new Error("Não foi possível carregar as conversas.");
  const conversas = (conv.data ?? []) as Conversa[];
  const conversa = conversas.find((x) => x.id === idPedido) ?? null;

  let mensagens: Mensagem[] = [];
  if (conversa) {
    const r = await c.supabase.from("messages").select("id, role, content, created_at").eq("conversation_id", conversa.id).order("created_at").limit(300);
    if (r.error) throw new Error("Não foi possível carregar as mensagens.");
    mensagens = (r.data ?? []) as Mensagem[];
  }

  const ambiente = conversa ? c.ambientes.find((a) => a.id === conversa.workspace_id) : (c.atual ?? c.ambientes.find((a) => a.agent_access));
  const configurado = agenteConfigurado();
  const liberado = Boolean(ambiente?.agent_access);

  return (
    <>
      <PageHeader titulo="Agente" descricao="Converse em linguagem normal. O agente consulta e altera seus dados pelas mesmas regras das telas." />

      <AcoesPendentes acoes={pendentes} />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-1 lg:order-first">
          <Link
            href="/agente"
            className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-muted", !conversa && "bg-accent text-accent-foreground")}
          >
            <Plus className="size-4" aria-hidden /> Nova conversa
          </Link>
          {conversas.length > 0 && <p className="mt-2 px-2.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">Conversas</p>}
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto lg:max-h-none">
            {conversas.map((x) => (
              <li key={x.id}>
                <Link
                  href={`/agente?c=${x.id}`}
                  aria-current={x.id === conversa?.id ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                    x.id === conversa?.id && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="line-clamp-1">{x.title}</span>
                  <span className="text-xs opacity-80">{nomeDoAmbiente(c, x.workspace_id)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {ambiente && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                {conversa ? "Conversa no ambiente" : "Nova conversa no ambiente"} <b className="text-foreground">{ambiente.name}</b>
                {conversa?.allow_cross ? ", com consulta aos outros ambientes liberados." : "."}
              </p>
              {conversa && (
                <div className="flex items-center gap-2">
                  <form action={definirConsultaCruzada}>
                    <input type="hidden" name="id" value={conversa.id} />
                    <input type="hidden" name="permitir" value={conversa.allow_cross ? "0" : "1"} />
                    <Enviar size="sm" variant="outline">
                      {conversa.allow_cross ? "Restringir a este ambiente" : "Autorizar outros ambientes"}
                    </Enviar>
                  </form>
                  <form action={excluirConversa}>
                    <input type="hidden" name="id" value={conversa.id} />
                    <Excluir rotulo="Excluir conversa" />
                  </form>
                </div>
              )}
            </div>
          )}

          {!configurado ? (
            <div className="rounded-xl border border-warning bg-warning-soft px-5 py-4">
              <p className="font-medium">O agente ainda não está ativo.</p>
              <p className="mt-1 text-sm">
                Falta preencher ANTHROPIC_API_KEY no arquivo .env.local e reiniciar o servidor. A chave é criada em console.anthropic.com. O modelo configurado é{" "}
                <span className="font-mono">{MODELO}</span>.
              </p>
            </div>
          ) : !ambiente || !liberado ? (
            <div className="rounded-xl border border-warning bg-warning-soft px-5 py-4">
              <p className="font-medium">{ambiente ? `O ambiente ${ambiente.name} não está liberado para o agente.` : "Nenhum ambiente está liberado para o agente."}</p>
              <p className="mt-1 text-sm">
                Você decide isso em{" "}
                <Link href="/configuracoes" className="font-medium underline underline-offset-4">
                  Ajustes
                </Link>
                . Enquanto não liberar, o agente não lê nem escreve nada desse ambiente.
              </p>
            </div>
          ) : (
            <Chat
              key={conversa?.id ?? "nova"}
              conversaId={conversa?.id ?? null}
              ambienteId={ambiente.id}
              iniciais={mensagens.map((m) => ({ role: m.role, content: m.content }))}
              rascunho={conversa ? "" : rascunho}
            />
          )}

          {mensagens.length > 0 && (!configurado || !liberado) && (
            <ul className="flex flex-col gap-3">
              {mensagens.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]",
                    m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start border border-border bg-card",
                  )}
                >
                  {m.content}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
