"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { campoTexto } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const FAZENDO: Record<string, string> = {
  listar_tarefas: "Consultando as tarefas",
  criar_tarefa: "Criando a tarefa",
  atualizar_tarefa: "Atualizando a tarefa",
  listar_projetos: "Consultando os projetos",
  criar_projeto: "Criando o projeto",
  atualizar_projeto: "Atualizando o projeto",
  listar_compromissos: "Consultando a agenda",
  criar_compromisso: "Marcando o compromisso",
  atualizar_compromisso: "Atualizando o compromisso",
  buscar_memoria: "Consultando a memória",
  salvar_memoria: "Guardando na memória",
  atualizar_memoria: "Corrigindo a memória",
  obter_alertas: "Verificando pendências",
  solicitar_exclusao: "Registrando o pedido de exclusão",
  web_search: "Pesquisando na internet",
};

type Props = {
  conversaId: string | null;
  ambienteId: string;
  iniciais: Msg[];
  /** Pergunta vinda do painel inicial: já chega preenchida no campo. */
  rascunho?: string;
};

export function Chat({ conversaId, ambienteId, iniciais, rascunho = "" }: Props) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<Msg[]>(iniciais);
  const [entrada, setEntrada] = useState(rascunho);
  const [ocupado, setOcupado] = useState(false);
  const [fazendo, setFazendo] = useState("");
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const idAtual = useRef(conversaId);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens, fazendo]);

  async function enviar() {
    const mensagem = entrada.trim();
    if (!mensagem || ocupado) return;
    setEntrada("");
    setErro("");
    setOcupado(true);
    setFazendo("Pensando");
    setMensagens((m) => [...m, { role: "user", content: mensagem }, { role: "assistant", content: "" }]);

    const acrescentar = (v: string) =>
      setMensagens((m) => {
        const copia = m.slice();
        const ultima = copia[copia.length - 1];
        copia[copia.length - 1] = { ...ultima, content: ultima.content + v };
        return copia;
      });

    try {
      const resp = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, conversaId: idAtual.current ?? undefined, ambienteId }),
      });
      if (!resp.ok || !resp.body) {
        const corpo = await resp.json().catch(() => null);
        throw new Error(corpo?.erro ?? "O agente não respondeu.");
      }

      const leitor = resp.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha) as { t: string; v?: string; nome?: string; conversaId?: string; mensagem?: string };
          if (ev.t === "inicio" && ev.conversaId) idAtual.current = ev.conversaId;
          else if (ev.t === "texto" && ev.v) {
            setFazendo("");
            acrescentar(ev.v);
          } else if (ev.t === "ferramenta") setFazendo(FAZENDO[ev.nome ?? ""] ?? "Trabalhando");
          else if (ev.t === "erro") setErro(ev.mensagem ?? "O agente encontrou um erro.");
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "O agente não respondeu.");
    } finally {
      setOcupado(false);
      setFazendo("");
      // Remove a bolha vazia se nada chegou, e atualiza listas, pendências e o endereço da conversa.
      setMensagens((m) => (m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].content ? m.slice(0, -1) : m));
      if (idAtual.current && idAtual.current !== conversaId) router.replace(`/agente?c=${idAtual.current}`);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-[50dvh] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-3" aria-live="polite">
        {mensagens.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-muted-foreground">
            Peça em linguagem normal: “o que tenho para hoje?”, “anota que preciso renovar a CNH até dia 10”, “marca dentista sexta às 14h”.
          </p>
        )}
        {mensagens.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]",
              m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start border border-border bg-card",
              m.role === "assistant" && !m.content && "hidden",
            )}
          >
            {m.content}
          </div>
        ))}
        {fazendo && <p className="animate-pulse text-sm text-muted-foreground">{fazendo}…</p>}
        {erro && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            {erro}
          </p>
        )}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="sticky bottom-20 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm md:bottom-4"
      >
        <textarea
          className={cn(campoTexto, "max-h-40 min-h-10 resize-none border-0 bg-transparent focus-visible:ring-0")}
          rows={1}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escreva para o agente…"
          aria-label="Mensagem para o agente"
        />
        <Button type="submit" size="icon" disabled={ocupado || !entrada.trim()} aria-label="Enviar">
          <ArrowUp aria-hidden />
        </Button>
      </form>
    </div>
  );
}
