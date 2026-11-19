"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ambienteDoForm, getContexto } from "@/lib/contexto";
import { addDias, ehDataISO, hojeISO, interpretarTexto } from "@/lib/datas";

const Prioridade = z.enum(["baixa", "media", "alta"]);
const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const dataOuNull = (v: FormDataEntryValue | null) => (ehDataISO(v) ? v : null);
const falhar = (msg: string): never => {
  throw new Error(msg);
};

export async function criarTarefa(form: FormData) {
  const c = await getContexto();
  const bruto = texto(form.get("title"));
  if (!bruto) falhar("Escreva o que precisa ser feito.");

  // Data escrita no próprio título ("renovar CNH dia 25") vale quando o campo de prazo está vazio.
  const lido = interpretarTexto(bruto);
  const prazoCampo = dataOuNull(form.get("due_date"));
  const usarLido = !prazoCampo && Boolean(lido.data);
  const prioridade = Prioridade.safeParse(form.get("priority"));

  let workspace_id = ambienteDoForm(c, form).id;
  let project_id: string | null = texto(form.get("project_id")) || null;
  const parent_id = texto(form.get("parent_id")) || null;

  // Subtarefa herda ambiente e projeto da tarefa-mãe; tarefa de projeto herda o ambiente dele.
  if (parent_id) {
    const { data: mae } = await c.supabase.from("tasks").select("workspace_id, project_id").eq("id", parent_id).single();
    if (!mae) falhar("A tarefa principal não existe mais.");
    workspace_id = mae!.workspace_id;
    project_id = mae!.project_id;
  } else if (project_id) {
    const { data: proj } = await c.supabase.from("projects").select("workspace_id").eq("id", project_id).single();
    if (!proj) falhar("O projeto não existe mais.");
    workspace_id = proj!.workspace_id;
  }

  const { error } = await c.supabase.from("tasks").insert({
    workspace_id,
    project_id,
    parent_id,
    title: usarLido ? lido.titulo : bruto,
    due_date: prazoCampo ?? (usarLido ? lido.data : form.get("hoje_padrao") === "1" ? hojeISO() : null),
    priority: prioridade.success ? prioridade.data : "media",
  });
  if (error) falhar("Não foi possível criar a tarefa.");
  revalidatePath("/", "layout");
}

export async function atualizarTarefa(form: FormData) {
  const c = await getContexto();
  const titulo = texto(form.get("title"));
  if (!titulo) falhar("O título não pode ficar vazio.");
  const prioridade = Prioridade.safeParse(form.get("priority"));
  const { error } = await c.supabase
    .from("tasks")
    .update({
      title: titulo,
      notes: texto(form.get("notes")),
      due_date: dataOuNull(form.get("due_date")),
      priority: prioridade.success ? prioridade.data : "media",
    })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar a tarefa.");
  revalidatePath("/", "layout");
}

export async function alternarTarefa(form: FormData) {
  const c = await getContexto();
  const concluir = form.get("concluir") === "1";
  const { error } = await c.supabase
    .from("tasks")
    .update({ status: concluir ? "concluida" : "aberta", done_at: concluir ? new Date().toISOString() : null })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível atualizar a tarefa.");
  revalidatePath("/", "layout");
}

export async function adiarTarefa(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase
    .from("tasks")
    .update({ due_date: addDias(hojeISO(), 1) })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível adiar a tarefa.");
  revalidatePath("/", "layout");
}

export async function excluirTarefa(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("tasks").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir a tarefa.");
  revalidatePath("/", "layout");
}
