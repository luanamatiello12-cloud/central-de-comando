"use client";

import { useRef, useState } from "react";
import { campo, Enviar } from "@/components/app/form";
import { interpretarTexto, quando } from "@/lib/datas";
import type { Ambiente } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { criarTarefa } from "./actions";

type Props = {
  ambientes: Ambiente[];
  ambientePadrao?: string;
  projetoId?: string;
  /** Sem data no texto nem no campo, a tarefa fica para hoje (usado no painel inicial). */
  hojePadrao?: boolean;
  compacto?: boolean;
};

/** Formulário de nova tarefa, com leitura de data escrita no título. */
export function NovaTarefa({ ambientes, ambientePadrao, projetoId, hojePadrao = false, compacto = false }: Props) {
  const [titulo, setTitulo] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const lido = titulo.trim() ? interpretarTexto(titulo) : null;
  const dica = lido?.data ? `Prazo entendido: ${quando(lido.data)}` : hojePadrao && lido ? "Fica para hoje" : "";

  return (
    <form
      ref={ref}
      action={async (form) => {
        await criarTarefa(form);
        setTitulo("");
        ref.current?.reset();
      }}
      className="flex flex-wrap gap-2"
    >
      {projetoId && <input type="hidden" name="project_id" value={projetoId} />}
      {hojePadrao && <input type="hidden" name="hoje_padrao" value="1" />}
      <input
        className={cn(campo, "flex-[1_1_240px]")}
        name="title"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="O que precisa ser feito? (ex.: renovar CNH dia 10)"
        aria-label="Nova tarefa"
        autoComplete="off"
        required
      />
      {!compacto && (
        <>
          <input className={campo} type="date" name="due_date" aria-label="Prazo" title="Prazo" />
          <select className={campo} name="priority" defaultValue="media" aria-label="Prioridade">
            <option value="media">Prioridade normal</option>
            <option value="alta">Prioridade alta</option>
            <option value="baixa">Prioridade baixa</option>
          </select>
        </>
      )}
      {!projetoId && ambientes.length > 0 && (
        <select className={campo} name="workspace_id" defaultValue={ambientePadrao ?? ambientes[0].id} aria-label="Ambiente">
          {ambientes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <Enviar enviando="Criando…">Adicionar</Enviar>
      <p className="min-h-5 basis-full text-xs text-primary" aria-live="polite">
        {dica}
      </p>
    </form>
  );
}
