"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ambienteDoForm, getContexto } from "@/lib/contexto";

const Tipo = z.enum(["preferencia", "decisao", "fato", "contexto"]);
const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const falhar = (msg: string): never => {
  throw new Error(msg);
};

export async function criarMemoria(form: FormData) {
  const c = await getContexto();
  const conteudo = texto(form.get("content"));
  if (!conteudo) falhar("Escreva o que deve ser lembrado.");
  const tipo = Tipo.safeParse(form.get("kind"));
  const { error } = await c.supabase.from("memories").insert({
    workspace_id: ambienteDoForm(c, form).id,
    kind: tipo.success ? tipo.data : "fato",
    content: conteudo,
    source: "usuario",
  });
  if (error) falhar("Não foi possível salvar a memória.");
  revalidatePath("/", "layout");
}

export async function atualizarMemoria(form: FormData) {
  const c = await getContexto();
  const conteudo = texto(form.get("content"));
  if (!conteudo) falhar("O texto não pode ficar vazio.");
  const tipo = Tipo.safeParse(form.get("kind"));
  const { error } = await c.supabase
    .from("memories")
    .update({ content: conteudo, ...(tipo.success ? { kind: tipo.data } : {}) })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar a memória.");
  revalidatePath("/", "layout");
}

export async function excluirMemoria(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("memories").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir a memória.");
  revalidatePath("/", "layout");
}
