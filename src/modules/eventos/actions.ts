"use server";

import { revalidatePath } from "next/cache";
import { ambienteDoForm, getContexto } from "@/lib/contexto";
import { ehDataISO, interpretarTexto } from "@/lib/datas";

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const horaOuNull = (v: FormDataEntryValue | null) => (/^\d{2}:\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 5) : null);
const falhar = (msg: string): never => {
  throw new Error(msg);
};

function horarios(form: FormData, horaLida = "") {
  const inicio = horaOuNull(form.get("start_time")) ?? (horaLida || null);
  let fim = horaOuNull(form.get("end_time"));
  if (!inicio) fim = null;
  if (inicio && fim && fim <= inicio) falhar("O fim precisa ser depois do início.");
  return { start_time: inicio, end_time: fim };
}

export async function criarEvento(form: FormData) {
  const c = await getContexto();
  const bruto = texto(form.get("title"));
  if (!bruto) falhar("Dê um nome ao compromisso.");

  // "consulta sexta 14h30": data e hora escritas no título valem sobre os campos vazios.
  const lido = interpretarTexto(bruto);
  const achou = Boolean(lido.data || lido.hora);
  const data = lido.data || (ehDataISO(form.get("event_date")) ? String(form.get("event_date")) : "");
  if (!data) falhar("Escolha a data do compromisso.");

  const { error } = await c.supabase.from("events").insert({
    workspace_id: ambienteDoForm(c, form).id,
    title: achou ? lido.titulo : bruto,
    event_date: data,
    ...horarios(form, lido.hora),
    location: texto(form.get("location")),
  });
  if (error) falhar("Não foi possível criar o compromisso.");
  revalidatePath("/", "layout");
}

export async function atualizarEvento(form: FormData) {
  const c = await getContexto();
  const titulo = texto(form.get("title"));
  if (!titulo) falhar("O nome não pode ficar vazio.");
  if (!ehDataISO(form.get("event_date"))) falhar("Escolha a data do compromisso.");
  const { error } = await c.supabase
    .from("events")
    .update({
      title: titulo,
      event_date: String(form.get("event_date")),
      ...horarios(form),
      location: texto(form.get("location")),
      notes: texto(form.get("notes")),
    })
    .eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível salvar o compromisso.");
  revalidatePath("/", "layout");
}

export async function excluirEvento(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("events").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir o compromisso.");
  revalidatePath("/", "layout");
}
