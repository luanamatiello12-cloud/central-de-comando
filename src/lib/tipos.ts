export type Prioridade = "baixa" | "media" | "alta";

export type Ambiente = {
  id: string;
  slug: string;
  name: string;
  sort: number;
  agent_access: boolean;
};

export type Projeto = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: "ativo" | "pausado" | "concluido" | "arquivado";
  priority: Prioridade;
  due_date: string | null;
  last_activity_at: string;
  created_at: string;
};

export type Tarefa = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string;
  status: "aberta" | "concluida";
  priority: Prioridade;
  due_date: string | null;
  done_at: string | null;
  created_at: string;
};

export type Evento = {
  id: string;
  workspace_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  notes: string;
};

export type Memoria = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  kind: "preferencia" | "decisao" | "fato" | "contexto";
  content: string;
  source: "usuario" | "agente";
  created_at: string;
  updated_at: string;
};

export type Conversa = {
  id: string;
  workspace_id: string;
  title: string;
  allow_cross: boolean;
  updated_at: string;
};

export type Mensagem = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export type AcaoAgente = {
  id: string;
  conversation_id: string | null;
  workspace_id: string | null;
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  summary: string;
  status: "executada" | "pendente" | "confirmada" | "cancelada" | "erro";
  created_at: string;
};

export type Auditoria = {
  id: number;
  workspace_id: string | null;
  table_name: string;
  action: "insert" | "update" | "delete";
  label: string;
  at: string;
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { alta: "Alta", media: "Normal", baixa: "Baixa" };
export const ROTULO_STATUS_PROJETO: Record<Projeto["status"], string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  concluido: "Concluído",
  arquivado: "Arquivado",
};
export const ROTULO_MEMORIA: Record<Memoria["kind"], string> = {
  preferencia: "Preferência",
  decisao: "Decisão",
  fato: "Fato",
  contexto: "Contexto",
};
