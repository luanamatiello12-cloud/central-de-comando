import "server-only";
import type { Contexto } from "@/lib/contexto";
import type { AcaoAgente, Auditoria, Evento, Memoria, Projeto, Tarefa } from "@/lib/tipos";

/**
 * Consultas de leitura usadas pelas telas. Todas respeitam o ambiente
 * selecionado (c.atual); sem seleção, trazem todos os ambientes do usuário.
 */
const COLS_TAREFA = "id, workspace_id, project_id, parent_id, title, notes, status, priority, due_date, done_at, created_at";
const COLS_PROJETO = "id, workspace_id, name, description, status, priority, due_date, last_activity_at, created_at";
const COLS_EVENTO = "id, workspace_id, title, event_date, start_time, end_time, location, notes";

function checar<T>(r: { data: T[] | null; error: { message: string } | null }, oQue: string): T[] {
  if (r.error) throw new Error(`Não foi possível carregar ${oQue}.`);
  return r.data ?? [];
}

export async function listarTarefas(c: Contexto, filtro: { projeto?: string } = {}) {
  let q = c.supabase.from("tasks").select(COLS_TAREFA).order("due_date", { nullsFirst: false }).order("created_at").limit(1000);
  if (c.atual) q = q.eq("workspace_id", c.atual.id);
  if (filtro.projeto) q = q.eq("project_id", filtro.projeto);
  return checar<Tarefa>(await q, "as tarefas");
}

export async function listarProjetos(c: Contexto) {
  let q = c.supabase.from("projects").select(COLS_PROJETO).order("created_at", { ascending: false }).limit(500);
  if (c.atual) q = q.eq("workspace_id", c.atual.id);
  return checar<Projeto>(await q, "os projetos");
}

export async function listarEventos(c: Contexto, de: string, ate: string) {
  let q = c.supabase
    .from("events")
    .select(COLS_EVENTO)
    .gte("event_date", de)
    .lte("event_date", ate)
    .order("event_date")
    .order("start_time", { nullsFirst: true })
    .limit(1000);
  if (c.atual) q = q.eq("workspace_id", c.atual.id);
  return checar<Evento>(await q, "os compromissos");
}

export async function listarMemorias(c: Contexto, busca = "") {
  let q = c.supabase
    .from("memories")
    .select("id, workspace_id, project_id, kind, content, source, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (c.atual) q = q.eq("workspace_id", c.atual.id);
  if (busca.trim()) q = q.textSearch("fts", busca.trim(), { type: "websearch", config: "portuguese" });
  return checar<Memoria>(await q, "a memória");
}

export async function listarAtividade(c: Contexto, limite = 12) {
  let q = c.supabase.from("audit_log").select("id, workspace_id, table_name, action, label, at").order("at", { ascending: false }).limit(limite);
  if (c.atual) q = q.eq("workspace_id", c.atual.id);
  return checar<Auditoria>(await q, "a atividade recente");
}

export async function listarAcoesPendentes(c: Contexto) {
  const q = c.supabase
    .from("agent_actions")
    .select("id, conversation_id, workspace_id, tool, input, result, summary, status, created_at")
    .eq("status", "pendente")
    .order("created_at", { ascending: false })
    .limit(50);
  return checar<AcaoAgente>(await q, "as ações pendentes");
}

/** Separa tarefas principais e subtarefas (um nível). */
export function agruparSubtarefas(tarefas: Tarefa[]) {
  const filhas = new Map<string, Tarefa[]>();
  for (const t of tarefas) {
    if (!t.parent_id) continue;
    const lista = filhas.get(t.parent_id) ?? [];
    lista.push(t);
    filhas.set(t.parent_id, lista);
  }
  return { principais: tarefas.filter((t) => !t.parent_id), filhas };
}
