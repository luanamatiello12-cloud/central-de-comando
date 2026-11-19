"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const TABELA: Record<string, string> = { tarefa: "tasks", projeto: "projects", compromisso: "events", memoria: "memories" };

/** O usuário confirma uma ação sensível que o agente deixou pendente. Só aqui ela acontece. */
export async function confirmarAcao(form: FormData) {
  const c = await getContexto();
  const id = texto(form.get("id"));
  const { data: acao } = await c.supabase.from("agent_actions").select("id, tool, input, status").eq("id", id).maybeSingle();
  if (!acao || acao.status !== "pendente") throw new Error("Esta ação não está mais pendente.");

  const entrada = acao.input as { tipo?: string; id?: string };
  const tabela = acao.tool === "solicitar_exclusao" ? TABELA[entrada.tipo ?? ""] : undefined;
  if (!tabela || !entrada.id) throw new Error("Não sei executar esta ação.");

  const { error } = await c.supabase.from(tabela).delete().eq("id", entrada.id);
  await c.supabase
    .from("agent_actions")
    .update({
      status: error ? "erro" : "confirmada",
      result: error ? { erro: error.message } : { excluido: true },
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error("Não foi possível excluir o registro.");
  revalidatePath("/", "layout");
}

export async function cancelarAcao(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase
    .from("agent_actions")
    .update({ status: "cancelada", resolved_at: new Date().toISOString() })
    .eq("id", texto(form.get("id")))
    .eq("status", "pendente");
  if (error) throw new Error("Não foi possível cancelar a ação.");
  revalidatePath("/", "layout");
}

/** Autoriza (ou revoga) a consulta a outros ambientes nesta conversa. */
export async function definirConsultaCruzada(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase
    .from("conversations")
    .update({ allow_cross: form.get("permitir") === "1" })
    .eq("id", texto(form.get("id")));
  if (error) throw new Error("Não foi possível salvar a permissão.");
  revalidatePath("/agente");
}

export async function excluirConversa(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("conversations").delete().eq("id", texto(form.get("id")));
  if (error) throw new Error("Não foi possível excluir a conversa.");
  revalidatePath("/agente");
  redirect("/agente");
}
