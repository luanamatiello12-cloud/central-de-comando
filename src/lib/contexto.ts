import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { bancoDisponivel } from "./supabase/config";
import { supabaseServer } from "./supabase/server";
import type { Ambiente } from "./tipos";

export const COOKIE_AMBIENTE = "ambiente";

/**
 * Usuário logado, seus ambientes e o ambiente selecionado (null = todos).
 * Toda página e toda ação começam por aqui: sem configuração vai para
 * /configurar, sem sessão vai para /login.
 */
export const getContexto = cache(async () => {
  if (!bancoDisponivel()) redirect("/configurar");
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const buscar = () => supabase.from("workspaces").select("id, slug, name, sort, agent_access").order("sort");
  let { data, error } = await buscar();
  if (error) redirect("/configurar?falta=banco");
  if (!data || data.length === 0) {
    await supabase.rpc("garantir_ambientes");
    ({ data, error } = await buscar());
    if (error || !data || data.length === 0) redirect("/configurar?falta=banco");
  }
  const ambientes = data as Ambiente[];
  const slug = (await cookies()).get(COOKIE_AMBIENTE)?.value;
  const atual = ambientes.find((a) => a.slug === slug) ?? null;
  return { supabase, user, ambientes, atual };
});

export type Contexto = Awaited<ReturnType<typeof getContexto>>;

/** Ambiente de um formulário: o escolhido no campo, senão o atual, senão o primeiro. */
export function ambienteDoForm(c: Contexto, form: FormData): Ambiente {
  const id = String(form.get("workspace_id") ?? "");
  return c.ambientes.find((a) => a.id === id) ?? c.atual ?? c.ambientes[0];
}

export function nomeDoAmbiente(c: Contexto, id: string | null) {
  return c.ambientes.find((a) => a.id === id)?.name ?? "";
}
