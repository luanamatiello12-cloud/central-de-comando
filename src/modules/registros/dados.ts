import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { COLS_REGISTRO, type Registro } from "./nucleo";

const ERRO = "Não foi possível carregar os registros. Se você usa o Supabase, confira se a migração 0003_modulos.sql foi executada.";

/** Registros de um ou mais tipos. O RLS garante que só vêm os do próprio usuário. */
export async function listarRegistros(supabase: Supabase, kinds: string[], filtro: { pai?: string; comData?: boolean } = {}): Promise<Registro[]> {
  if (kinds.length === 0) return [];
  let q = supabase.from("records").select(COLS_REGISTRO).in("kind", kinds).order("created_at", { ascending: false }).limit(3000);
  if (filtro.pai) q = q.eq("parent_id", filtro.pai);
  if (filtro.comData) q = q.not("date", "is", null);
  const { data, error } = await q;
  if (error) throw new Error(ERRO);
  return (data ?? []) as Registro[];
}

export async function buscarRegistro(supabase: Supabase, id: string): Promise<Registro | null> {
  const { data, error } = await supabase.from("records").select(COLS_REGISTRO).eq("id", id).maybeSingle();
  if (error) throw new Error(ERRO);
  return (data as Registro | null) ?? null;
}

export async function filhosDe(supabase: Supabase, id: string): Promise<Registro[]> {
  const { data, error } = await supabase.from("records").select(COLS_REGISTRO).eq("parent_id", id).order("created_at").limit(3000);
  if (error) throw new Error(ERRO);
  return (data ?? []) as Registro[];
}
