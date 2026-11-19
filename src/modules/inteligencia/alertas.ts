import { addDias, diasEntre, fmtData, fmtHora, quando } from "@/lib/datas";
import type { AcaoAgente, Evento, Projeto, Tarefa } from "@/lib/tipos";

/**
 * Inteligência proativa calculada direto dos dados, sem IA: funciona mesmo
 * sem chave de API e alimenta o painel, os relatórios e o agente.
 */
export type Alerta = {
  tipo: "atraso" | "prazo" | "parado" | "conflito" | "esquecida" | "pendente";
  titulo: string;
  detalhe: string;
  href: string;
  grave: boolean;
};

export const DIAS_PROJETO_PARADO = 14;
export const DIAS_TAREFA_ESQUECIDA = 30;

const minutos = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/** Pares de compromissos com horário que se sobrepõem no mesmo dia. Sem fim definido, conta 1 hora. */
export function conflitos(eventos: Evento[]): [Evento, Evento][] {
  const pares: [Evento, Evento][] = [];
  const comHora = eventos.filter((e) => e.start_time);
  for (let i = 0; i < comHora.length; i++) {
    for (let j = i + 1; j < comHora.length; j++) {
      const a = comHora[i];
      const b = comHora[j];
      if (a.event_date !== b.event_date) continue;
      const a0 = minutos(a.start_time!);
      const a1 = a.end_time ? minutos(a.end_time) : a0 + 60;
      const b0 = minutos(b.start_time!);
      const b1 = b.end_time ? minutos(b.end_time) : b0 + 60;
      if (a0 < b1 && b0 < a1) pares.push([a, b]);
    }
  }
  return pares;
}

export function idsEmConflito(eventos: Evento[]) {
  return new Set(conflitos(eventos).flatMap(([a, b]) => [a.id, b.id]));
}

type Dados = { tarefas: Tarefa[]; projetos: Projeto[]; eventos: Evento[]; pendentes?: AcaoAgente[]; hoje: string };

export function gerarAlertas({ tarefas, projetos, eventos, pendentes = [], hoje }: Dados): Alerta[] {
  const alertas: Alerta[] = [];
  const abertas = tarefas.filter((t) => t.status === "aberta");
  const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

  if (pendentes.length) {
    alertas.push({
      tipo: "pendente",
      titulo: `${pendentes.length} ${plural(pendentes.length, "ação do agente aguarda", "ações do agente aguardam")} sua confirmação`,
      detalhe: pendentes[0].summary,
      href: "/agente",
      grave: true,
    });
  }

  const atrasadas = abertas.filter((t) => t.due_date && t.due_date < hoje).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  if (atrasadas.length) {
    alertas.push({
      tipo: "atraso",
      titulo: `${atrasadas.length} ${plural(atrasadas.length, "tarefa atrasada", "tarefas atrasadas")}`,
      detalhe: `A mais antiga: “${atrasadas[0].title}”, de ${fmtData(atrasadas[0].due_date)}.`,
      href: "/tarefas",
      grave: true,
    });
  }

  for (const [a, b] of conflitos(eventos.filter((e) => e.event_date >= hoje && e.event_date <= addDias(hoje, 7)))) {
    alertas.push({
      tipo: "conflito",
      titulo: `Conflito de horário ${quando(a.event_date, hoje)}`,
      detalhe: `“${a.title}” (${fmtHora(a.start_time)}) e “${b.title}” (${fmtHora(b.start_time)}) se sobrepõem.`,
      href: `/calendario?semana=${a.event_date}`,
      grave: true,
    });
  }

  for (const p of projetos.filter((p) => p.status === "ativo")) {
    if (p.due_date && p.due_date < hoje) {
      alertas.push({
        tipo: "atraso",
        titulo: `Projeto com prazo vencido: ${p.name}`,
        detalhe: `O prazo era ${fmtData(p.due_date)}.`,
        href: `/projetos/${p.id}`,
        grave: true,
      });
    }
    const parado = diasEntre(p.last_activity_at.slice(0, 10), hoje);
    if (parado >= DIAS_PROJETO_PARADO) {
      alertas.push({
        tipo: "parado",
        titulo: `Projeto sem movimentação: ${p.name}`,
        detalhe: `Nenhuma alteração há ${parado} dias.`,
        href: `/projetos/${p.id}`,
        grave: false,
      });
    }
  }

  const proximas = abertas.filter((t) => t.due_date && t.due_date > hoje && t.due_date <= addDias(hoje, 3));
  if (proximas.length) {
    alertas.push({
      tipo: "prazo",
      titulo: `${proximas.length} ${plural(proximas.length, "tarefa vence", "tarefas vencem")} nos próximos 3 dias`,
      detalhe: proximas
        .slice(0, 3)
        .map((t) => `“${t.title}” (${quando(t.due_date!, hoje)})`)
        .join(", "),
      href: "/tarefas",
      grave: false,
    });
  }

  const esquecidas = abertas.filter((t) => !t.due_date && !t.parent_id && diasEntre(t.created_at.slice(0, 10), hoje) >= DIAS_TAREFA_ESQUECIDA);
  if (esquecidas.length) {
    alertas.push({
      tipo: "esquecida",
      titulo: `${esquecidas.length} ${plural(esquecidas.length, "tarefa sem prazo parada", "tarefas sem prazo paradas")} há mais de ${DIAS_TAREFA_ESQUECIDA} dias`,
      detalhe: `Por exemplo: “${esquecidas[0].title}”. Defina um prazo ou exclua.`,
      href: "/tarefas",
      grave: false,
    });
  }

  return alertas;
}
