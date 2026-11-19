import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { Memoria } from "@/lib/tipos";

const COLS = "id, workspace_id, project_id, kind, content, source, created_at, updated_at";

/** Radical simples: tira plural e terminações comuns, para "reunião" achar "reuniões". */
export function radical(palavra: string) {
  const p = palavra.toLowerCase().replace(/[%_\\]/g, "");
  const r = p.replace(/(ões|ães|ãos|ão|es|as|os|a|o|e|s)$/u, "");
  return r.length >= 4 ? r : p;
}

type Filtro = { consulta?: string; ambientes?: string[]; tipo?: string; projeto?: string; limite?: number };

/**
 * Busca na memória usada pela tela e pelo agente. Junta duas buscas: a textual
 * em português do Postgres (entende flexões e ignora palavras vazias) e uma por
 * trecho do radical de cada palavra, que cobre os casos em que o dicionário falha.
 */
export async function buscarMemorias(supabase: Supabase, f: Filtro): Promise<Memoria[]> {
  const limite = f.limite ?? 200;
  const base = () => {
    let q = supabase.from("memories").select(COLS).order("updated_at", { ascending: false }).limit(limite);
    if (f.ambientes) q = q.in("workspace_id", f.ambientes);
    if (f.tipo) q = q.eq("kind", f.tipo);
    if (f.projeto) q = q.eq("project_id", f.projeto);
    return q;
  };

  const consulta = f.consulta?.trim() ?? "";
  if (!consulta) {
    const r = await base();
    if (r.error) throw new Error("Não foi possível carregar a memória.");
    return (r.data ?? []) as Memoria[];
  }

  const palavras = consulta.split(/\s+/).filter((p) => p.length >= 3).slice(0, 5);
  const buscas = [
    base().textSearch("fts", consulta.split(/\s+/).join(" or "), { type: "websearch", config: "portuguese" }),
    ...palavras.map((p) => base().ilike("content", `%${radical(p)}%`)),
  ];
  const respostas = await Promise.all(buscas);
  if (respostas.every((r) => r.error)) throw new Error("Não foi possível buscar na memória.");

  // Junta sem repetir; quem aparece em mais buscas vem primeiro.
  const pontos = new Map<string, { m: Memoria; n: number }>();
  for (const r of respostas) {
    for (const m of (r.data ?? []) as Memoria[]) {
      const atual = pontos.get(m.id);
      if (atual) atual.n++;
      else pontos.set(m.id, { m, n: 1 });
    }
  }
  return [...pontos.values()]
    .sort((a, b) => b.n - a.n || b.m.updated_at.localeCompare(a.m.updated_at))
    .slice(0, limite)
    .map((x) => x.m);
}
