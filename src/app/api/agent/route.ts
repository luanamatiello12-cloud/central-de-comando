import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { FERRAMENTAS, type ContextoAgente } from "@/agent/ferramentas";
import { FERRAMENTAS_FINANCEIRAS } from "@/agent/ferramentas-financeiro";
import { contextoDoPedido, INSTRUCOES } from "@/agent/instrucoes";
import { agenteConfigurado, anthropic, MODELO } from "@/agent/provedor";
import { hojeISO, horaAgora } from "@/lib/datas";
import { bancoDisponivel } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import type { Ambiente } from "@/lib/tipos";

// O agente pode encadear várias ferramentas e pesquisas numa resposta.
export const maxDuration = 300;

const Corpo = z.object({
  mensagem: z.string().trim().min(1).max(8000),
  conversaId: z.uuid().optional(),
  ambienteId: z.uuid().optional(),
});

const HISTORICO = 30;
const MAX_VOLTAS = 15;
// Modelos que aceitam o fallback do servidor quando um pedido é recusado pelos filtros de segurança.
const COM_FALLBACK = /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/;

const erro = (status: number, mensagem: string) => Response.json({ erro: mensagem }, { status });

export async function POST(req: Request) {
  if (!bancoDisponivel()) return erro(503, "O banco de dados não está configurado.");
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro(401, "Sessão expirada. Entre de novo.");
  if (!agenteConfigurado()) return erro(503, "O agente não está configurado: falta ANTHROPIC_API_KEY no .env.local.");

  const corpo = Corpo.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return erro(400, "Mensagem inválida.");
  const { mensagem, conversaId, ambienteId } = corpo.data;

  const amb = await supabase.from("workspaces").select("id, slug, name, sort, agent_access").order("sort");
  if (amb.error || !amb.data?.length) return erro(500, "Não foi possível carregar seus ambientes.");
  const ambientes = amb.data as Ambiente[];

  // Conversa existente ou nova.
  let conversa: { id: string; workspace_id: string; allow_cross: boolean };
  if (conversaId) {
    const r = await supabase.from("conversations").select("id, workspace_id, allow_cross").eq("id", conversaId).maybeSingle();
    if (r.error || !r.data) return erro(404, "Conversa não encontrada.");
    conversa = r.data;
  } else {
    const alvo = ambientes.find((a) => a.id === ambienteId) ?? ambientes.find((a) => a.agent_access);
    if (!alvo) return erro(403, "Nenhum ambiente está liberado para o agente. Libere um em Ajustes.");
    const r = await supabase
      .from("conversations")
      .insert({ workspace_id: alvo.id, title: mensagem.slice(0, 70) })
      .select("id, workspace_id, allow_cross")
      .single();
    if (r.error || !r.data) return erro(500, "Não foi possível criar a conversa.");
    conversa = r.data;
  }

  const ambiente = ambientes.find((a) => a.id === conversa.workspace_id);
  if (!ambiente) return erro(500, "O ambiente desta conversa não existe mais.");
  if (!ambiente.agent_access) {
    return erro(403, `O ambiente ${ambiente.name} não está liberado para o agente. Você pode liberar em Ajustes.`);
  }
  const liberados = ambientes.filter((a) => a.agent_access);
  const permitidos = conversa.allow_cross ? liberados : [ambiente];
  const bloqueados = ambientes.filter((a) => !permitidos.includes(a));

  // Memória de curto prazo: as últimas mensagens da conversa, só o texto.
  const hist = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversa.id)
    .order("created_at", { ascending: false })
    .limit(HISTORICO);
  if (hist.error) return erro(500, "Não foi possível carregar o histórico da conversa.");
  const anteriores = (hist.data ?? []).reverse().filter((m) => m.content.trim());
  while (anteriores.length && anteriores[0].role !== "user") anteriores.shift();

  const gravou = await supabase.from("messages").insert({ conversation_id: conversa.id, role: "user", content: mensagem });
  if (gravou.error) return erro(500, "Não foi possível salvar sua mensagem.");

  // Memória de longo prazo que entra sempre: preferências e contexto dos ambientes liberados.
  const mem = await supabase
    .from("memories")
    .select("kind, content, workspace_id")
    .in("workspace_id", permitidos.map((a) => a.id))
    .in("kind", ["preferencia", "contexto"])
    .order("updated_at", { ascending: false })
    .limit(40);
  const memorias = (mem.data ?? []).map((m) => ({
    kind: m.kind,
    content: m.content,
    ambiente: ambientes.find((a) => a.id === m.workspace_id)?.slug ?? "",
  }));

  const hoje = hojeISO();
  const ctx: ContextoAgente = { supabase, conversaId: conversa.id, ambiente, permitidos, hoje };
  const codificador = new TextEncoder();

  const corpoDaResposta = new ReadableStream<Uint8Array>({
    async start(controle) {
      const enviar = (evento: Record<string, unknown>) => controle.enqueue(codificador.encode(JSON.stringify(evento) + "\n"));
      enviar({ t: "inicio", conversaId: conversa.id });

      const registrar = (tool: string, input: unknown, linha: { status: string; summary: string; result?: unknown }) =>
        supabase.from("agent_actions").insert({
          conversation_id: conversa.id,
          workspace_id: ambiente.id,
          tool,
          input,
          summary: linha.summary.slice(0, 500),
          status: linha.status,
          result: linha.result ?? null,
        });

      const ferramentas = [...FERRAMENTAS, ...FERRAMENTAS_FINANCEIRAS].map((f) =>
        betaZodTool({
          name: f.nome,
          description: f.descricao,
          inputSchema: f.esquema,
          eager_input_streaming: true,
          run: async (entrada) => {
            enviar({ t: "ferramenta", nome: f.nome });
            try {
              const r = await f.executar(entrada, ctx);
              await registrar(f.nome, entrada, { status: r.status ?? "executada", summary: r.resumo });
              return JSON.stringify(r.resultado);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "erro desconhecido";
              await registrar(f.nome, entrada, { status: "erro", summary: msg, result: { erro: msg } });
              return "ERRO: " + msg;
            }
          },
        }),
      );

      let texto = "";
      const criarRunner = (mensagens: Anthropic.Beta.BetaMessageParam[]) =>
        anthropic().beta.messages.toolRunner({
          model: MODELO,
          max_tokens: 64000,
          // Bloco fixo primeiro (cacheável); o contexto que muda vem depois.
          system: [
            { type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } },
            { type: "text", text: contextoDoPedido({ hoje, hora: horaAgora(), ambiente, permitidos, bloqueados, memorias }) },
          ],
          tools: [...ferramentas, { type: "web_search_20260209", name: "web_search", max_uses: 5 }],
          messages: mensagens,
          output_config: { effort: "medium" },
          max_iterations: MAX_VOLTAS,
          stream: true,
          ...(COM_FALLBACK.test(MODELO) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });

      let runner = criarRunner([
        ...anteriores.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: mensagem },
      ]);

      try {
        let recusou = false;
        for (let tentativa = 0; ; tentativa++) {
          try {
            for await (const fluxo of runner) {
              for await (const ev of fluxo) {
                if (ev.type === "content_block_start" && ev.content_block.type === "text" && texto && !texto.endsWith("\n")) {
                  texto += "\n\n";
                  enviar({ t: "texto", v: "\n\n" });
                } else if (ev.type === "content_block_start" && ev.content_block.type === "server_tool_use") {
                  enviar({ t: "ferramenta", nome: ev.content_block.name });
                } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                  texto += ev.delta.text;
                  enviar({ t: "texto", v: ev.delta.text });
                }
              }
              const final = await fluxo.finalMessage();
              tentativa = 0;
              // Entrada de ferramenta cortada pelo limite de tokens pode passar na validação: não executar.
              if (final.stop_reason === "max_tokens" && final.content.some((b) => b.type === "tool_use")) {
                throw new RespostaCortada();
              }
              if (final.stop_reason === "refusal") {
                recusou = true;
                break;
              }
            }
            break;
          } catch (e) {
            // Erros da API e respostas cortadas sobem; JSON ilegível ou conexão caída ganham nova tentativa.
            if (e instanceof Anthropic.APIError || e instanceof RespostaCortada || tentativa >= 2) throw e;
            runner = criarRunner(runner.params.messages);
          }
        }

        if (recusou && !texto.trim()) {
          texto = "Não posso ajudar com esse pedido.";
          enviar({ t: "texto", v: texto });
        }
        if (!texto.trim()) {
          texto = "Não consegui produzir uma resposta. Tente reformular o pedido.";
          enviar({ t: "texto", v: texto });
        }
        await supabase.from("messages").insert({ conversation_id: conversa.id, role: "assistant", content: texto.trim() });
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversa.id);
        enviar({ t: "fim" });
      } catch (e) {
        // Guarda o que já foi escrito, para a conversa não ficar com um buraco.
        if (texto.trim()) {
          await supabase.from("messages").insert({ conversation_id: conversa.id, role: "assistant", content: texto.trim() });
        }
        enviar({ t: "erro", mensagem: mensagemDeErro(e) });
      } finally {
        controle.close();
      }
    },
  });

  return new Response(corpoDaResposta, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

class RespostaCortada extends Error {}

function mensagemDeErro(e: unknown) {
  if (e instanceof RespostaCortada) return "A resposta ficou longa demais e foi interrompida. Peça em partes menores.";
  if (e instanceof Anthropic.AuthenticationError) return "A chave ANTHROPIC_API_KEY foi recusada. Confira o valor no .env.local.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Sua chave não tem acesso a este modelo. Confira AGENT_MODEL no .env.local.";
  if (e instanceof Anthropic.NotFoundError) return `O modelo "${MODELO}" não foi encontrado. Confira AGENT_MODEL no .env.local.`;
  if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API atingido. Aguarde um pouco e tente de novo.";
  if (e instanceof Anthropic.APIConnectionError) return "Não foi possível conectar à API de IA. Confira sua internet.";
  if (e instanceof Anthropic.APIError) return `A API de IA devolveu um erro (${e.status ?? "sem código"}). Tente de novo em instantes.`;
  return "O agente encontrou um erro inesperado. Tente de novo.";
}
