"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto, type Contexto } from "@/lib/contexto";
import { ehDataISO, hojeISO } from "@/lib/datas";
import { entidade, moduloDe, type Entidade } from "./esquemas";
import { alternarDia, COLS_REGISTRO, lerCampos, logDoHabito, statusValido, type Registro } from "./nucleo";

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const falhar = (msg: string): never => {
  throw new Error(msg);
};

function ambienteDoModulo(c: Contexto, ent: Entidade) {
  const slug = moduloDe(ent.kind)!.ambiente;
  const a = c.ambientes.find((x) => x.slug === slug);
  if (!a) falhar("O ambiente deste módulo não existe nesta conta.");
  return a!;
}

/** Lê do formulário os campos da entidade (enviados como `c_<nome>`). */
function camposDoForm(ent: Entidade, form: FormData) {
  const { data, erros } = lerCampos(ent, (nome) => (form.has("c_" + nome) ? form.get("c_" + nome) : undefined));
  if (erros.length) falhar(erros.join(" "));
  return data;
}

async function paiValido(c: Contexto, ent: Entidade, id: string) {
  if (!id) {
    if (ent.pai?.obrigatorio) falhar(`Escolha a que este registro pertence.`);
    return null;
  }
  const { data } = await c.supabase.from("records").select("id, kind").eq("id", id).maybeSingle();
  if (!data || !ent.pai?.kinds.includes(data.kind)) falhar("O registro ao qual este pertence não existe mais.");
  return id;
}

async function buscar(c: Contexto, id: string) {
  const { data, error } = await c.supabase.from("records").select(COLS_REGISTRO).eq("id", id).maybeSingle();
  if (error) falhar("Não foi possível carregar o registro.");
  if (!data) falhar("Este registro não existe mais.");
  const r = data as Registro;
  const ent = entidade(r.kind);
  if (!ent) falhar("Tipo de registro desconhecido.");
  return { r, ent: ent! };
}

export async function criarRegistro(form: FormData) {
  const c = await getContexto();
  const ent = entidade(texto(form.get("kind")));
  if (!ent) falhar("Tipo de registro desconhecido.");
  const e = ent!;
  const titulo = texto(form.get("title"));
  if (!titulo) falhar(`Preencha: ${e.titulo ?? "Título"}.`);
  const data = texto(form.get("date"));
  if (data && !ehDataISO(data)) falhar("Data inválida.");

  const { error } = await c.supabase.from("records").insert({
    workspace_id: ambienteDoModulo(c, e).id,
    kind: e.kind,
    parent_id: e.pai ? await paiValido(c, e, texto(form.get("parent_id"))) : null,
    title: titulo.slice(0, 300),
    status: statusValido(e, form.get("status")),
    date: e.data ? data || null : null,
    data: Object.fromEntries(Object.entries(camposDoForm(e, form)).filter(([, v]) => v !== null)),
  });
  if (error) falhar(`Não foi possível salvar. Se você usa o Supabase, confira se a migração 0003_modulos.sql foi executada.`);
  revalidatePath("/", "layout");
}

export async function atualizarRegistro(form: FormData) {
  const c = await getContexto();
  const { r, ent } = await buscar(c, texto(form.get("id")));
  const titulo = texto(form.get("title"));
  if (!titulo) falhar(`Preencha: ${ent.titulo ?? "Título"}.`);
  const data = texto(form.get("date"));
  if (data && !ehDataISO(data)) falhar("Data inválida.");

  const mudancas: Record<string, unknown> = {
    title: titulo.slice(0, 300),
    // Mantém o que não é campo de formulário (ex.: o histórico de um hábito).
    data: { ...r.data, ...camposDoForm(ent, form) },
  };
  if (ent.status) mudancas.status = statusValido(ent, form.get("status"));
  if (ent.data) mudancas.date = data || null;
  if (ent.pai && form.has("parent_id")) mudancas.parent_id = await paiValido(c, ent, texto(form.get("parent_id")));

  const { error } = await c.supabase.from("records").update(mudancas).eq("id", r.id);
  if (error) falhar("Não foi possível salvar.");
  revalidatePath("/", "layout");
}

/** Muda só a situação (seletor rápido nas listas e a caixa de marcar dos itens). */
export async function definirSituacao(form: FormData) {
  const c = await getContexto();
  const { r, ent } = await buscar(c, texto(form.get("id")));
  if (!ent.status) return;
  const { error } = await c.supabase
    .from("records")
    .update({ status: statusValido(ent, form.get("status")) })
    .eq("id", r.id);
  if (error) falhar("Não foi possível salvar.");
  revalidatePath("/", "layout");
}

export async function alternarHabito(form: FormData) {
  const c = await getContexto();
  const { r } = await buscar(c, texto(form.get("id")));
  const dia = texto(form.get("dia"));
  const hoje = hojeISO();
  if (r.kind !== "pessoal.habito" || !ehDataISO(dia) || dia > hoje) falhar("Dia inválido.");
  const { error } = await c.supabase
    .from("records")
    .update({ data: { ...r.data, log: alternarDia(logDoHabito(r), dia, hoje) } })
    .eq("id", r.id);
  if (error) falhar("Não foi possível salvar.");
  revalidatePath("/", "layout");
}

/** Abre o agente com o pedido de pesquisa já redigido; o usuário confere e envia. */
export async function iniciarPesquisa(form: FormData) {
  await getContexto();
  const pergunta = texto(form.get("pergunta")).slice(0, 600);
  if (!pergunta) falhar("Escreva o que você quer pesquisar.");
  const categoria = texto(form.get("categoria"));
  const pedido =
    `Pesquise na internet${categoria ? ` (categoria: ${categoria})` : ""}: ${pergunta}\n\n` +
    "Apresente as fontes com link e data, separe o que está confirmado do que não foi possível confirmar e, ao final, salve a pesquisa no módulo Pesquisa.";
  redirect(`/agente?q=${encodeURIComponent(pedido)}`);
}

/** Exclui o registro e, pelo banco, tudo o que pertence a ele. Volta para a lista quando pedido. */
export async function excluirRegistro(form: FormData) {
  const c = await getContexto();
  const { error } = await c.supabase.from("records").delete().eq("id", texto(form.get("id")));
  if (error) falhar("Não foi possível excluir.");
  revalidatePath("/", "layout");
  const voltar = texto(form.get("voltar"));
  if (voltar.startsWith("/m/")) redirect(voltar);
}
