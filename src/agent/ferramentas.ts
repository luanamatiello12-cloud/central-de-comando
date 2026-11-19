import "server-only";
import { z } from "zod";
import { addDias, ehDataISO } from "@/lib/datas";
import type { Supabase } from "@/lib/supabase/server";
import type { Ambiente, Evento, Projeto, Tarefa } from "@/lib/tipos";
import { gerarAlertas } from "@/modules/inteligencia/alertas";
import { buscarMemorias } from "@/modules/memoria/busca";

/**
 * Ferramentas do agente, neutras quanto ao provedor de IA: nome, descrição,
 * esquema (zod) e a função que executa. Todas usam a sessão do usuário, então
 * o RLS do banco vale para o agente; além disso, cada uma se limita aos
 * ambientes liberados para a conversa.
 */
export type ContextoAgente = {
  supabase: Supabase;
  conversaId: string;
  ambiente: Ambiente;
  /** Ambientes que esta conversa pode ler e escrever. */
  permitidos: Ambiente[];
  hoje: string;
};

export type Ferramenta<S extends z.ZodType = z.ZodType> = {
  nome: string;
  descricao: string;
  esquema: S;
  /** Devolve o resultado (vai para o modelo) e um resumo curto (vai para o log). */
  executar: (entrada: z.infer<S>, c: ContextoAgente) => Promise<{ resultado: unknown; resumo: string; status?: "executada" | "pendente" }>;
};

const ferramenta = <S extends z.ZodType>(f: Ferramenta<S>) => f as unknown as Ferramenta;

const dataISO = z.string().refine(ehDataISO, "Use o formato AAAA-MM-DD.");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.");
const prioridade = z.enum(["baixa", "media", "alta"]);
const uuid = z.uuid();
const slugAmbiente = z.string().describe("Slug do ambiente (pessoal, trabalho, ministerio, academico, financeiro). Omita para usar o ambiente da conversa.");

const ids = (c: ContextoAgente) => c.permitidos.map((a) => a.id);

function ambienteAlvo(c: ContextoAgente, slug?: string) {
  if (!slug) return c.ambiente;
  const achado = c.permitidos.find((a) => a.slug === slug);
  if (!achado) {
    throw new Error(
      `O ambiente "${slug}" não está liberado para esta conversa. Diga ao usuário que ele pode autorizar a consulta a outros ambientes nesta conversa, ou liberar o ambiente para o agente em Ajustes.`,
    );
  }
  return achado;
}

function exigir<T>(r: { data: T; error: { message: string } | null }, oQue: string): NonNullable<T> {
  if (r.error) throw new Error(`Falha ao ${oQue}: ${r.error.message}`);
  if (r.data === null || r.data === undefined || (Array.isArray(r.data) && r.data.length === 0)) {
    throw new Error(`Não encontrei o registro para ${oQue} nos ambientes liberados para esta conversa.`);
  }
  return r.data;
}

const nomeAmb = (c: ContextoAgente, id: string) => c.permitidos.find((a) => a.id === id)?.slug ?? "";

export const FERRAMENTAS: Ferramenta[] = [
  ferramenta({
    nome: "listar_tarefas",
    descricao: "Lista tarefas do usuário. Use antes de responder sobre pendências, prazos ou prioridades, e para achar o id de uma tarefa.",
    esquema: z.object({
      situacao: z.enum(["abertas", "concluidas", "todas"]).optional().describe("Padrão: abertas."),
      projeto_id: uuid.optional(),
      vencendo_ate: dataISO.optional().describe("Só tarefas com prazo até esta data (inclui atrasadas)."),
    }),
    async executar(e, c) {
      let q = c.supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, project_id, parent_id, workspace_id, notes")
        .in("workspace_id", ids(c))
        .order("due_date", { nullsFirst: false })
        .limit(200);
      const situacao = e.situacao ?? "abertas";
      if (situacao !== "todas") q = q.eq("status", situacao === "abertas" ? "aberta" : "concluida");
      if (e.projeto_id) q = q.eq("project_id", e.projeto_id);
      if (e.vencendo_ate) q = q.lte("due_date", e.vencendo_ate);
      const { data, error } = await q;
      if (error) throw new Error("Falha ao listar tarefas: " + error.message);
      const tarefas = (data ?? []).map((t) => ({ ...t, ambiente: nomeAmb(c, t.workspace_id), workspace_id: undefined }));
      return { resultado: { hoje: c.hoje, total: tarefas.length, tarefas }, resumo: `Listou ${tarefas.length} tarefas (${situacao})` };
    },
  }),

  ferramenta({
    nome: "criar_tarefa",
    descricao: "Cria uma tarefa. Para subtarefa, informe tarefa_pai_id. Converta datas ditas pelo usuário (amanhã, sexta) para AAAA-MM-DD.",
    esquema: z.object({
      titulo: z.string().min(1).max(300),
      prazo: dataISO.optional(),
      prioridade: prioridade.optional(),
      projeto_id: uuid.optional(),
      tarefa_pai_id: uuid.optional(),
      anotacoes: z.string().max(4000).optional(),
      ambiente: slugAmbiente.optional(),
    }),
    async executar(e, c) {
      let workspace_id = ambienteAlvo(c, e.ambiente).id;
      let project_id = e.projeto_id ?? null;
      if (e.tarefa_pai_id) {
        const mae = exigir(
          await c.supabase.from("tasks").select("workspace_id, project_id").eq("id", e.tarefa_pai_id).in("workspace_id", ids(c)).maybeSingle(),
          "localizar a tarefa principal",
        );
        workspace_id = mae.workspace_id;
        project_id = mae.project_id;
      } else if (project_id) {
        const proj = exigir(
          await c.supabase.from("projects").select("workspace_id").eq("id", project_id).in("workspace_id", ids(c)).maybeSingle(),
          "localizar o projeto",
        );
        workspace_id = proj.workspace_id;
      }
      const criada = exigir(
        await c.supabase
          .from("tasks")
          .insert({
            workspace_id,
            project_id,
            parent_id: e.tarefa_pai_id ?? null,
            title: e.titulo.trim(),
            due_date: e.prazo ?? null,
            priority: e.prioridade ?? "media",
            notes: e.anotacoes ?? "",
          })
          .select("id, title, due_date, priority")
          .single(),
        "criar a tarefa",
      );
      return { resultado: criada, resumo: `Criou a tarefa “${criada.title}”` };
    },
  }),

  ferramenta({
    nome: "atualizar_tarefa",
    descricao: "Altera uma tarefa existente: título, prazo (null remove), prioridade, anotações, ou marca como concluída/reaberta.",
    esquema: z.object({
      id: uuid,
      titulo: z.string().min(1).max(300).optional(),
      prazo: dataISO.nullable().optional(),
      prioridade: prioridade.optional(),
      anotacoes: z.string().max(4000).optional(),
      concluida: z.boolean().optional(),
    }),
    async executar(e, c) {
      const mudancas: Record<string, unknown> = {};
      if (e.titulo !== undefined) mudancas.title = e.titulo.trim();
      if (e.prazo !== undefined) mudancas.due_date = e.prazo;
      if (e.prioridade !== undefined) mudancas.priority = e.prioridade;
      if (e.anotacoes !== undefined) mudancas.notes = e.anotacoes;
      if (e.concluida !== undefined) {
        mudancas.status = e.concluida ? "concluida" : "aberta";
        mudancas.done_at = e.concluida ? new Date().toISOString() : null;
      }
      if (Object.keys(mudancas).length === 0) throw new Error("Nenhuma alteração informada.");
      const linhas = exigir(
        await c.supabase.from("tasks").update(mudancas).eq("id", e.id).in("workspace_id", ids(c)).select("id, title, status, due_date, priority"),
        "atualizar a tarefa",
      );
      return { resultado: linhas[0], resumo: `Atualizou a tarefa “${linhas[0].title}”` };
    },
  }),

  ferramenta({
    nome: "listar_projetos",
    descricao: "Lista os projetos com situação, prazo, última movimentação e contagem de tarefas.",
    esquema: z.object({}),
    async executar(_e, c) {
      const [p, t] = await Promise.all([
        c.supabase.from("projects").select("id, name, description, status, priority, due_date, last_activity_at, workspace_id").in("workspace_id", ids(c)).limit(200),
        c.supabase.from("tasks").select("project_id, status").in("workspace_id", ids(c)).not("project_id", "is", null).limit(2000),
      ]);
      if (p.error || t.error) throw new Error("Falha ao listar projetos.");
      const projetos = (p.data ?? []).map((x) => {
        const doProjeto = (t.data ?? []).filter((y) => y.project_id === x.id);
        return {
          ...x,
          ambiente: nomeAmb(c, x.workspace_id),
          workspace_id: undefined,
          tarefas_abertas: doProjeto.filter((y) => y.status === "aberta").length,
          tarefas_concluidas: doProjeto.filter((y) => y.status === "concluida").length,
        };
      });
      return { resultado: { hoje: c.hoje, projetos }, resumo: `Listou ${projetos.length} projetos` };
    },
  }),

  ferramenta({
    nome: "criar_projeto",
    descricao: "Cria um projeto.",
    esquema: z.object({
      nome: z.string().min(1).max(200),
      descricao: z.string().max(4000).optional(),
      prazo: dataISO.optional(),
      prioridade: prioridade.optional(),
      ambiente: slugAmbiente.optional(),
    }),
    async executar(e, c) {
      const criado = exigir(
        await c.supabase
          .from("projects")
          .insert({
            workspace_id: ambienteAlvo(c, e.ambiente).id,
            name: e.nome.trim(),
            description: e.descricao ?? "",
            due_date: e.prazo ?? null,
            priority: e.prioridade ?? "media",
          })
          .select("id, name")
          .single(),
        "criar o projeto",
      );
      return { resultado: criado, resumo: `Criou o projeto “${criado.name}”` };
    },
  }),

  ferramenta({
    nome: "atualizar_projeto",
    descricao: "Altera um projeto: nome, descrição, prazo (null remove), prioridade ou situação.",
    esquema: z.object({
      id: uuid,
      nome: z.string().min(1).max(200).optional(),
      descricao: z.string().max(4000).optional(),
      prazo: dataISO.nullable().optional(),
      prioridade: prioridade.optional(),
      situacao: z.enum(["ativo", "pausado", "concluido", "arquivado"]).optional(),
    }),
    async executar(e, c) {
      const mudancas: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
      if (e.nome !== undefined) mudancas.name = e.nome.trim();
      if (e.descricao !== undefined) mudancas.description = e.descricao;
      if (e.prazo !== undefined) mudancas.due_date = e.prazo;
      if (e.prioridade !== undefined) mudancas.priority = e.prioridade;
      if (e.situacao !== undefined) mudancas.status = e.situacao;
      if (Object.keys(mudancas).length === 1) throw new Error("Nenhuma alteração informada.");
      const linhas = exigir(
        await c.supabase.from("projects").update(mudancas).eq("id", e.id).in("workspace_id", ids(c)).select("id, name, status, due_date"),
        "atualizar o projeto",
      );
      return { resultado: linhas[0], resumo: `Atualizou o projeto “${linhas[0].name}”` };
    },
  }),

  ferramenta({
    nome: "listar_compromissos",
    descricao: "Lista os compromissos do calendário entre duas datas (inclusive). Use para consultar a agenda e checar conflitos antes de marcar algo.",
    esquema: z.object({ de: dataISO, ate: dataISO }),
    async executar(e, c) {
      const { data, error } = await c.supabase
        .from("events")
        .select("id, title, event_date, start_time, end_time, location, notes, workspace_id")
        .in("workspace_id", ids(c))
        .gte("event_date", e.de)
        .lte("event_date", e.ate)
        .order("event_date")
        .order("start_time", { nullsFirst: true })
        .limit(300);
      if (error) throw new Error("Falha ao listar compromissos: " + error.message);
      const compromissos = (data ?? []).map((x) => ({ ...x, ambiente: nomeAmb(c, x.workspace_id), workspace_id: undefined }));
      return { resultado: { compromissos }, resumo: `Consultou a agenda de ${e.de} a ${e.ate}` };
    },
  }),

  ferramenta({
    nome: "criar_compromisso",
    descricao: "Cria um compromisso no calendário. Sem horário de início, vale para o dia todo.",
    esquema: z.object({
      titulo: z.string().min(1).max(300),
      data: dataISO,
      inicio: hora.optional(),
      fim: hora.optional(),
      local: z.string().max(300).optional(),
      ambiente: slugAmbiente.optional(),
    }),
    async executar(e, c) {
      if (e.fim && (!e.inicio || e.fim <= e.inicio)) throw new Error("O fim precisa ser depois do início.");
      const criado = exigir(
        await c.supabase
          .from("events")
          .insert({
            workspace_id: ambienteAlvo(c, e.ambiente).id,
            title: e.titulo.trim(),
            event_date: e.data,
            start_time: e.inicio ?? null,
            end_time: e.fim ?? null,
            location: e.local ?? "",
          })
          .select("id, title, event_date, start_time, end_time")
          .single(),
        "criar o compromisso",
      );
      return { resultado: criado, resumo: `Marcou “${criado.title}” em ${criado.event_date}` };
    },
  }),

  ferramenta({
    nome: "atualizar_compromisso",
    descricao: "Altera um compromisso: nome, data, horários (null remove) ou local.",
    esquema: z.object({
      id: uuid,
      titulo: z.string().min(1).max(300).optional(),
      data: dataISO.optional(),
      inicio: hora.nullable().optional(),
      fim: hora.nullable().optional(),
      local: z.string().max(300).optional(),
    }),
    async executar(e, c) {
      const mudancas: Record<string, unknown> = {};
      if (e.titulo !== undefined) mudancas.title = e.titulo.trim();
      if (e.data !== undefined) mudancas.event_date = e.data;
      if (e.inicio !== undefined) mudancas.start_time = e.inicio;
      if (e.fim !== undefined) mudancas.end_time = e.fim;
      if (e.inicio === null) mudancas.end_time = null;
      if (e.local !== undefined) mudancas.location = e.local;
      if (Object.keys(mudancas).length === 0) throw new Error("Nenhuma alteração informada.");
      const linhas = exigir(
        await c.supabase.from("events").update(mudancas).eq("id", e.id).in("workspace_id", ids(c)).select("id, title, event_date, start_time, end_time"),
        "atualizar o compromisso",
      );
      return { resultado: linhas[0], resumo: `Atualizou o compromisso “${linhas[0].title}”` };
    },
  }),

  ferramenta({
    nome: "buscar_memoria",
    descricao:
      "Busca na memória de longo prazo (preferências, decisões, fatos, contexto). Consulte antes de perguntar ao usuário algo que ele já pode ter dito. Sem consulta, lista as mais recentes.",
    esquema: z.object({
      consulta: z.string().max(200).optional().describe("Palavras-chave em português."),
      tipo: z.enum(["preferencia", "decisao", "fato", "contexto"]).optional(),
      projeto_id: uuid.optional(),
    }),
    async executar(e, c) {
      const achadas = await buscarMemorias(c.supabase, { consulta: e.consulta, ambientes: ids(c), tipo: e.tipo, projeto: e.projeto_id, limite: 40 });
      const memorias = achadas.map((m) => ({ id: m.id, kind: m.kind, content: m.content, project_id: m.project_id, updated_at: m.updated_at, ambiente: nomeAmb(c, m.workspace_id) }));
      return { resultado: { memorias }, resumo: `Consultou a memória${e.consulta ? ` por “${e.consulta}”` : ""} (${memorias.length})` };
    },
  }),

  ferramenta({
    nome: "salvar_memoria",
    descricao:
      "Guarda na memória de longo prazo algo que continuará valendo em outras conversas: uma preferência do usuário, uma decisão tomada, um fato durável ou contexto de um projeto. Não use para coisas passageiras nem para o que já é tarefa ou compromisso.",
    esquema: z.object({
      tipo: z.enum(["preferencia", "decisao", "fato", "contexto"]),
      conteudo: z.string().min(3).max(2000).describe("Frase completa e autoexplicativa, que faça sentido lida sozinha no futuro."),
      projeto_id: uuid.optional(),
      ambiente: slugAmbiente.optional(),
    }),
    async executar(e, c) {
      let workspace_id = ambienteAlvo(c, e.ambiente).id;
      if (e.projeto_id) {
        const proj = exigir(
          await c.supabase.from("projects").select("workspace_id").eq("id", e.projeto_id).in("workspace_id", ids(c)).maybeSingle(),
          "localizar o projeto",
        );
        workspace_id = proj.workspace_id;
      }
      const criada = exigir(
        await c.supabase
          .from("memories")
          .insert({ workspace_id, project_id: e.projeto_id ?? null, kind: e.tipo, content: e.conteudo.trim(), source: "agente" })
          .select("id, kind, content")
          .single(),
        "salvar a memória",
      );
      return { resultado: criada, resumo: `Memorizou: ${criada.content.slice(0, 80)}` };
    },
  }),

  ferramenta({
    nome: "atualizar_memoria",
    descricao: "Corrige o texto de uma memória existente quando o usuário disser que ela mudou ou estava errada.",
    esquema: z.object({ id: uuid, conteudo: z.string().min(3).max(2000) }),
    async executar(e, c) {
      const linhas = exigir(
        await c.supabase.from("memories").update({ content: e.conteudo.trim() }).eq("id", e.id).in("workspace_id", ids(c)).select("id, kind, content"),
        "atualizar a memória",
      );
      return { resultado: linhas[0], resumo: `Corrigiu a memória: ${linhas[0].content.slice(0, 80)}` };
    },
  }),

  ferramenta({
    nome: "obter_alertas",
    descricao: "Calcula os alertas atuais: tarefas atrasadas, prazos próximos, projetos sem movimentação, conflitos de horário e tarefas esquecidas. Use para resumos e para sugerir prioridades.",
    esquema: z.object({}),
    async executar(_e, c) {
      const [t, p, ev] = await Promise.all([
        c.supabase.from("tasks").select("id, workspace_id, project_id, parent_id, title, notes, status, priority, due_date, done_at, created_at").in("workspace_id", ids(c)).eq("status", "aberta").limit(1000),
        c.supabase.from("projects").select("id, workspace_id, name, description, status, priority, due_date, last_activity_at, created_at").in("workspace_id", ids(c)).limit(300),
        c.supabase.from("events").select("id, workspace_id, title, event_date, start_time, end_time, location, notes").in("workspace_id", ids(c)).gte("event_date", c.hoje).lte("event_date", addDias(c.hoje, 7)).limit(300),
      ]);
      if (t.error || p.error || ev.error) throw new Error("Falha ao calcular alertas.");
      const alertas = gerarAlertas({ tarefas: (t.data ?? []) as Tarefa[], projetos: (p.data ?? []) as Projeto[], eventos: (ev.data ?? []) as Evento[], hoje: c.hoje });
      return { resultado: { hoje: c.hoje, alertas: alertas.map(({ titulo, detalhe, grave }) => ({ titulo, detalhe, grave })) }, resumo: `Calculou ${alertas.length} alertas` };
    },
  }),

  ferramenta({
    nome: "solicitar_exclusao",
    descricao:
      "Pede a exclusão de um registro. A exclusão NÃO acontece agora: fica pendente até o usuário confirmar na tela. Depois de chamar, avise o usuário de que ele precisa confirmar. Esta é a única forma de excluir.",
    esquema: z.object({
      tipo: z.enum(["tarefa", "projeto", "compromisso", "memoria"]),
      id: uuid,
      motivo: z.string().min(3).max(300),
    }),
    async executar(e, c) {
      const tabela = { tarefa: "tasks", projeto: "projects", compromisso: "events", memoria: "memories" }[e.tipo];
      const coluna = e.tipo === "projeto" ? "name" : e.tipo === "memoria" ? "content" : "title";
      const linha = exigir(
        await c.supabase.from(tabela).select(`id, rotulo:${coluna}`).eq("id", e.id).in("workspace_id", ids(c)).maybeSingle(),
        `localizar o registro (${e.tipo})`,
      ) as unknown as { id: string; rotulo: string };
      const rotulo = String(linha.rotulo).slice(0, 100);
      return {
        resultado: { pendente: true, aviso: "Exclusão registrada como pendente. O usuário precisa confirmar na tela do agente." },
        resumo: `Excluir ${e.tipo}: “${rotulo}”. Motivo: ${e.motivo}`,
        status: "pendente",
      };
    },
  }),
];
