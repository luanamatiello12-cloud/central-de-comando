"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COOKIE_AMBIENTE, getContexto } from "@/lib/contexto";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

export type EstadoLogin = { erro?: string; aviso?: string };

const Credenciais = z.object({
  email: z.email("Digite um e-mail válido."),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
});

export async function entrarOuCadastrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  if (!supabaseConfigurado()) return { erro: "O Supabase ainda não está configurado." };
  const dados = Credenciais.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await supabaseServer();
  if (form.get("modo") === "cadastrar") {
    const { data, error } = await supabase.auth.signUp({ email: dados.data.email, password: dados.data.senha });
    if (error) return { erro: "Não foi possível criar a conta: " + error.message };
    if (!data.session) return { aviso: "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
    if (error) return { erro: "E-mail ou senha incorretos." };
  }
  redirect("/");
}

export async function sair() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function trocarAmbiente(form: FormData) {
  const c = await getContexto();
  const slug = String(form.get("ambiente") ?? "");
  const store = await cookies();
  if (c.ambientes.some((a) => a.slug === slug)) {
    store.set(COOKIE_AMBIENTE, slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    store.delete(COOKIE_AMBIENTE);
  }
  revalidatePath("/", "layout");
}

export async function definirAcessoDoAgente(form: FormData) {
  const c = await getContexto();
  const id = String(form.get("id") ?? "");
  const permitir = form.get("permitir") === "1";
  const { error } = await c.supabase.from("workspaces").update({ agent_access: permitir }).eq("id", id);
  if (error) throw new Error("Não foi possível salvar a permissão do agente.");
  revalidatePath("/", "layout");
}
