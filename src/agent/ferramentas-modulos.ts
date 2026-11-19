import "server-only";
import { z } from "zod";
import { ehDataISO } from "@/lib/datas";
import { ENTIDADES, entidade, KINDS, moduloDe, type Entidade } from "@/modules/registros/esquemas";
import { COLS_REGISTRO, lerCampos, statusValido, type Registro } from "@/modules/registros/nucleo";
import type { ContextoAgente, Ferramenta } from "./ferramentas";

/**
 * Ferramentas do agente para os módulos especializados (Trabalho, Ministério,
 * Faculdade, Carreira, Vida pessoal, Pesquisa). São três ferramentas genéricas;
 * o catálogo de tipos e campos vem do mesmo esquema que gera as telas.
 */
const ferramenta = <S extends z.ZodType>(f: Ferramenta<S>) => f as unknown as Ferramenta;

const tipo = z.enum(KINDS as [string, ...string[]]);
const dataISO = z.string().refine(ehDataISO, "Use o formato AAAA-MM-DD.");
const campos = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).describe("Campos próprios do tipo, pelo nome técnico listado no catálogo. null ou \"\" apaga o campo.");

const CATALOGO = ENTIDADES.map((e) => {
  const partes = [
    e.status && `situações: ${e.status.join(" | ")}`,
    e.data && `data = ${e.data}${e.anual ? " (repete todo ano)" : ""}`,
    e.pai && `pai_id ${e.pai.obrigatorio ? "obrigatório" : "opcional"}: ${e.pai.kinds.join(" ou ")}`,
    `campos: ${e.campos.map((c) => `${c.nome}${c.opcoes ? ` (${c.opcoes.join(" | ")})` : c.tipo === "texto" ? "" : ` (${c.tipo})`}`).join(", ")}`,
  ].filter(Boolean);
  return `- ${e.kind} (${e.nome}; título = ${e.titulo ?? "Título"}): ${partes.join("; ")}`;
}).join("\n");

/** Ambiente do módulo, exigindo que esteja liberado para a conversa. */
function ambienteDe(c: ContextoAgente, ent: Entidade) {
  const mod = moduloDe(ent.kind)!;
  const a = c.permitidos.find((x) => x.slug === mod.ambiente);
  if (!a) {
    throw new Error(
      `O módulo ${mod.nome} fica no ambiente "${mod.ambiente}", que não está liberado para esta conversa. Diga ao usuário que ele pode autorizar outros ambientes nesta conversa ou liberar o ambiente para o agente em Ajustes.`,
    );
  }
  return a;
}

function exigirEntidade(kind: string) {
  const ent = entidade(kind);
  if (!ent) throw new Error(`Tipo desconhecido: ${kind}.`);
  return ent;
}

const paraOAgente = (r: Registro) => ({
  id: r.id,
  tipo: r.kind,
  titulo: r.title,
  situacao: r.status || undefined,
  data: r.date ?? undefined,
  pai_id: r.parent_id ?? undefined,
  // O histórico diário dos hábitos é grande e não ajuda o modelo.
  campos: Object.fromEntries(Object.entries(r.data).filter(([k, v]) => k !== "log" && v !== null && v !== "")),
});

export const FERRAMENTAS_DE_MODULOS: Ferramenta[] = [
  ferramenta({
    nome: "listar_registros",
    descricao:
      "Lista registros dos módulos Trabalho, Ministério, Faculdade, Carreira, Vida pessoal e Pesquisa. Use antes de responder sobre esses assuntos e para achar o id de um registro.\n\nCatálogo de tipos:\n" +
      CATALOGO,
    esquema: z.object({
      tipo,
      busca: z.string().max(100).optional().describe("Trecho do título."),
      pai_id: z.uuid().optional().describe("Só os registros que pertencem a este (ex.: avaliações de uma disciplina)."),
    }),
    async executar(e, c) {
      const ent = exigirEntidade(e.tipo);
      const amb = ambienteDe(c, ent);
      let q = c.supabase.from("records").select(COLS_REGISTRO).eq("kind", ent.kind).eq("workspace_id", amb.id).order("created_at", { ascending: false }).limit(200);
      if (e.pai_id) q = q.eq("parent_id", e.pai_id);
      if (e.busca?.trim()) q = q.ilike("title", `%${e.busca.trim().replace(/[%_\\]/g, "")}%`);
      const { data, error } = await q;
      if (error) throw new Error("Falha ao listar: " + error.message);
      const registros = ((data ?? []) as Registro[]).map(paraOAgente);
      return { resultado: { hoje: c.hoje, total: registros.length, registros }, resumo: `Listou ${registros.length} em ${ent.plural}` };
    },
  }),

  ferramenta({
    nome: "criar_registro",
    descricao:
      "Cria um registro em um dos módulos (reunião, demanda, pessoa de um grupo, prova, oportunidade, data importante, item de lista, pesquisa salva...). Veja tipos e campos no catálogo de listar_registros. Converta datas faladas para AAAA-MM-DD.",
    esquema: z.object({
      tipo,
      titulo: z.string().min(1).max(300),
      situacao: z.string().max(60).optional().describe("Uma das situações do tipo. Padrão: a primeira."),
      data: dataISO.optional(),
      pai_id: z.uuid().optional(),
      campos: campos.optional(),
    }),
    async executar(e, c) {
      const ent = exigirEntidade(e.tipo);
      const amb = ambienteDe(c, ent);
      if (e.situacao && ent.status && !ent.status.includes(e.situacao)) throw new Error(`Situação inválida. Use uma de: ${ent.status.join(", ")}.`);
      const lido = lerCampos(ent, (nome) => e.campos?.[nome]);
      if (lido.erros.length) throw new Error(lido.erros.join(" "));
      const desconhecidos = Object.keys(e.campos ?? {}).filter((k) => !ent.campos.some((x) => x.nome === k));
      if (desconhecidos.length) throw new Error(`Campos que não existem em ${ent.kind}: ${desconhecidos.join(", ")}.`);

      let parent_id: string | null = null;
      if (ent.pai) {
        if (e.pai_id) {
          const pai = await c.supabase.from("records").select("id, kind").eq("id", e.pai_id).eq("workspace_id", amb.id).maybeSingle();
          if (!pai.data || !ent.pai.kinds.includes(pai.data.kind)) throw new Error(`pai_id precisa ser um registro de: ${ent.pai.kinds.join(" ou ")}.`);
          parent_id = e.pai_id;
        } else if (ent.pai.obrigatorio) {
          throw new Error(`Este tipo exige pai_id (um registro de ${ent.pai.kinds.join(" ou ")}). Liste ou crie o pai primeiro.`);
        }
      }

      const r = await c.supabase
        .from("records")
        .insert({
          workspace_id: amb.id,
          kind: ent.kind,
          parent_id,
          title: e.titulo.trim(),
          status: statusValido(ent, e.situacao),
          date: ent.data ? (e.data ?? null) : null,
          data: Object.fromEntries(Object.entries(lido.data).filter(([, v]) => v !== null)),
        })
        .select(COLS_REGISTRO)
        .single();
      if (r.error || !r.data) throw new Error("Falha ao criar: " + (r.error?.message ?? "sem resposta"));
      return { resultado: paraOAgente(r.data as Registro), resumo: `Criou ${ent.nome.toLowerCase()}: ${e.titulo.trim()}` };
    },
  }),

  ferramenta({
    nome: "atualizar_registro",
    descricao: "Altera um registro de módulo: título, situação, data (null remove) ou campos (só os informados mudam). Use para registrar a ata de uma reunião, a nota de uma prova, o andamento de uma pessoa ou de uma oportunidade.",
    esquema: z.object({
      id: z.uuid(),
      titulo: z.string().min(1).max(300).optional(),
      situacao: z.string().max(60).optional(),
      data: dataISO.nullable().optional(),
      campos: campos.optional(),
    }),
    async executar(e, c) {
      const atual = await c.supabase.from("records").select(COLS_REGISTRO).eq("id", e.id).maybeSingle();
      if (atual.error || !atual.data) throw new Error("Não encontrei esse registro.");
      const reg = atual.data as Registro;
      const ent = exigirEntidade(reg.kind);
      const amb = ambienteDe(c, ent);
      if (reg.workspace_id !== amb.id) throw new Error("Esse registro está em um ambiente que não está liberado para esta conversa.");
      if (e.situacao && ent.status && !ent.status.includes(e.situacao)) throw new Error(`Situação inválida. Use uma de: ${ent.status.join(", ")}.`);
      const desconhecidos = Object.keys(e.campos ?? {}).filter((k) => !ent.campos.some((x) => x.nome === k));
      if (desconhecidos.length) throw new Error(`Campos que não existem em ${ent.kind}: ${desconhecidos.join(", ")}.`);
      const lido = lerCampos(ent, (nome) => e.campos?.[nome]);
      if (lido.erros.length) throw new Error(lido.erros.join(" "));

      const mudancas: Record<string, unknown> = {};
      if (e.titulo !== undefined) mudancas.title = e.titulo.trim();
      if (e.situacao !== undefined && ent.status) mudancas.status = e.situacao;
      if (e.data !== undefined && ent.data) mudancas.date = e.data;
      if (e.campos && Object.keys(lido.data).length) mudancas.data = { ...reg.data, ...lido.data };
      if (Object.keys(mudancas).length === 0) throw new Error("Nenhuma alteração informada.");

      const r = await c.supabase.from("records").update(mudancas).eq("id", reg.id).select(COLS_REGISTRO);
      if (r.error || !r.data?.length) throw new Error("Falha ao atualizar: " + (r.error?.message ?? "sem resposta"));
      return { resultado: paraOAgente(r.data[0] as Registro), resumo: `Atualizou ${ent.nome.toLowerCase()}: ${(r.data[0] as Registro).title}` };
    },
  }),
];
