"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ambienteDoForm, getContexto } from "@/lib/contexto";
import { ehDataISO } from "@/lib/datas";

const Prioridade = z.enum(["baixa", "media", "alta"]);
const Status = z.enum(["ativo", "pausado", "concluido", "arquivado"]);
const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const dataOuNull = (v: FormDataEntryValue | null) => (ehDataISO(v) ? v : null);
const falhar = (msg: string): never => {
  throw new Error(msg);
};

export async function criarProjeto(form: FormData) {
  const c = await getContexto();
  const nome = texto(form.get("name"));
  if (!nome) falhar("Dê um nome ao projeto.");
  const prioridade = Prioridade.safeParse(form.get("priority"));
  const { error } = await c.supabase.from("projects").insert({
    workspace_id: ambienteDoForm(c, form).id,
    name: nome,
    description: texto(form.get("description")),
    due_date: dataOuNull(form.get("due_date")),
    priority: prioridade.success ? prioridade.data : "media",
  });
  if (error) falhar("Não foi possível criar o projeto.");
  revalidatePath("/", "layout");
}

export async function atualizarProjeto(form: FormData) {
  const c = await getContexto();
  const nome = texto(form.get("name"));
  if (!nome) falhar("O nome não pode ficar vazio.");
  const prioridade = Prioridade.safeParse(form.get("priority"));
  const status = Status.safeParse(form.get("status"));
  const { error } = await c.supabase
    .from("projects")
    .update({
      name: nome,
      description: texto(form.get("description")),
      due_date: dataOuNull(form.get("due_date")),
      priority: prioridade.success ? prioridade.data : "media",
      status: status.success ? status.data : "ativo",
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar o projeto.");
  revalidatePath("/", "layout");
}

/** Exclui o projeto e, pelo banco, as tarefas e memórias ligadas a ele. */
export async function excluirProjeto(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("projects").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir o projeto.");
  revalidatePath("/", "layout");
  redirect("/projetos");
}
