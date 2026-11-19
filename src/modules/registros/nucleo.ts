import { addDias, ehDataISO, fmtData, quando } from "@/lib/datas";
import { brl, lerValor } from "@/lib/dinheiro";
import type { Alerta } from "@/modules/inteligencia/alertas";
import { ENTIDADES, entidade, moduloDe, type Campo, type Entidade } from "./esquemas";

/** Lógica dos módulos que não depende de banco: validação, exibição, alertas e contas. */

export type Registro = {
  id: string;
  workspace_id: string;
  kind: string;
  parent_id: string | null;
  title: string;
  status: string;
  date: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export const COLS_REGISTRO = "id, workspace_id, kind, parent_id, title, status, date, data, created_at, updated_at";

// ---------------------------------------------------------------- validação

/** Só aceita endereços http(s): impede links que executem código. */
export function urlSegura(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Converte valores crus (de formulário ou do agente) nos campos da entidade.
 * Campo ausente (undefined) é ignorado; vazio apaga o valor.
 */
export function lerCampos(ent: Entidade, ler: (nome: string) => unknown): { data: Record<string, unknown>; erros: string[] } {
  const saida: Record<string, unknown> = {};
  const erros: string[] = [];
  for (const c of ent.campos) {
    const bruto = ler(c.nome);
    if (bruto === undefined) continue;
    const s = String(bruto ?? "").trim();
    if (!s) {
      saida[c.nome] = null;
      continue;
    }
    if (c.tipo === "numero") {
      const n = Number(s.replace(",", "."));
      if (Number.isFinite(n)) saida[c.nome] = n;
      else erros.push(`${c.rotulo}: informe um número.`);
    } else if (c.tipo === "dinheiro") {
      const n = lerValor(s);
      if (n !== null && n >= 0) saida[c.nome] = n;
      else erros.push(`${c.rotulo}: informe um valor em reais.`);
    } else if (c.tipo === "data") {
      if (ehDataISO(s)) saida[c.nome] = s;
      else erros.push(`${c.rotulo}: data inválida.`);
    } else if (c.tipo === "hora") {
      if (/^([01]\d|2[0-3]):[0-5]\d/.test(s)) saida[c.nome] = s.slice(0, 5);
      else erros.push(`${c.rotulo}: horário inválido.`);
    } else if (c.tipo === "url") {
      const u = urlSegura(s);
      if (u) saida[c.nome] = u;
      else erros.push(`${c.rotulo}: o link precisa começar com http:// ou https://.`);
    } else if (c.tipo === "select") {
      if (c.opcoes?.includes(s)) saida[c.nome] = s;
      else erros.push(`${c.rotulo}: escolha uma das opções (${c.opcoes?.join(", ")}).`);
    } else {
      saida[c.nome] = s.slice(0, c.tipo === "longo" ? 20000 : 500);
    }
  }
  return { data: saida, erros };
}

export function statusValido(ent: Entidade, s: unknown): string {
  if (!ent.status) return "";
  return ent.status.includes(String(s)) ? String(s) : ent.status[0];
}

// ----------------------------------------------------------------- exibição

export function formatarCampo(c: Campo, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (c.tipo === "dinheiro") return brl(Number(v));
  if (c.tipo === "data") return fmtData(String(v));
  if (c.tipo === "numero") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(v));
  return String(v);
}

/** Textos curtos para a linha da lista, a partir dos campos de `resumo`. */
export function resumoDoRegistro(ent: Entidade, r: Registro): string[] {
  return (ent.resumo ?? [])
    .map((nome) => {
      const c = ent.campos.find((x) => x.nome === nome);
      if (!c || c.tipo === "longo" || c.tipo === "url") return "";
      const texto = formatarCampo(c, r.data[nome]);
      return texto && ["numero", "dinheiro", "data", "hora"].includes(c.tipo) ? `${c.rotulo.toLowerCase()}: ${texto}` : texto;
    })
    .filter(Boolean);
}

// -------------------------------------------------------------------- datas

/** Próxima vez em que uma data anual acontece (hoje conta). 29/02 vira 28/02 em ano comum. */
export function proximaOcorrencia(iso: string, hoje: string): string {
  const [, mes, dia] = iso.split("-");
  for (const ano of [+hoje.slice(0, 4), +hoje.slice(0, 4) + 1]) {
    let tentativa = `${ano}-${mes}-${dia}`;
    if (!ehDataISO(tentativa)) tentativa = `${ano}-02-28`;
    if (tentativa >= hoje) return tentativa;
  }
  return iso;
}

/** Data que importa para ordenar e alertar: a própria, ou a próxima ocorrência se for anual. */
export function dataEfetiva(ent: Entidade, r: Registro, hoje: string): string | null {
  if (!r.date) return null;
  return ent.anual ? proximaOcorrencia(r.date, hoje) : r.date;
}

export function encerrado(ent: Entidade, r: Registro) {
  return Boolean(ent.finais?.includes(r.status));
}

/** Ordena para a lista: com data, as próximas primeiro e as encerradas no fim; sem data, as mais recentes. */
export function ordenar(ent: Entidade, lista: Registro[], hoje: string): Registro[] {
  return [...lista].sort((a, b) => {
    const fa = encerrado(ent, a) ? 1 : 0;
    const fb = encerrado(ent, b) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    if (ent.data) {
      const da = dataEfetiva(ent, a, hoje) ?? "9999";
      const db = dataEfetiva(ent, b, hoje) ?? "9999";
      if (da !== db) return fa ? db.localeCompare(da) : da.localeCompare(db);
    }
    return ent.data || ent.status ? a.title.localeCompare(b.title, "pt-BR") : b.created_at.localeCompare(a.created_at);
  });
}

// ------------------------------------------------------------------ alertas

/** Um alerta por tipo de registro com data próxima (ou vencida, quando a entidade pede). */
export function alertasDeRegistros(registros: Registro[], hoje: string, ambientesVisiveis?: Set<string>): Alerta[] {
  const alertas: Alerta[] = [];
  for (const ent of ENTIDADES) {
    if (!ent.alerta) continue;
    const mod = moduloDe(ent.kind)!;
    const doTipo = registros.filter((r) => r.kind === ent.kind && r.date && !encerrado(ent, r) && (!ambientesVisiveis || ambientesVisiveis.has(r.workspace_id)));
    const href = `/m/${mod.slug}?e=${ent.kind}`;
    const limite = addDias(hoje, ent.alerta.dias);
    const lista = (rs: Registro[]) =>
      rs
        .slice(0, 3)
        .map((r) => `${r.title} (${quando(dataEfetiva(ent, r, hoje)!, hoje)})`)
        .join("; ") + (rs.length > 3 ? ` e mais ${rs.length - 3}` : "");

    const proximos = doTipo
      .filter((r) => {
        const d = dataEfetiva(ent, r, hoje)!;
        return d >= hoje && d <= limite;
      })
      .sort((a, b) => dataEfetiva(ent, a, hoje)!.localeCompare(dataEfetiva(ent, b, hoje)!));
    if (proximos.length) {
      alertas.push({ tipo: "prazo", titulo: `${ent.alerta.frase}: ${proximos.length === 1 ? proximos[0].title : `${proximos.length} nos próximos ${ent.alerta.dias} dias`}`, detalhe: lista(proximos), href, grave: false });
    }

    if (ent.alerta.atraso && !ent.anual) {
      const vencidos = doTipo.filter((r) => r.date! < hoje).sort((a, b) => a.date!.localeCompare(b.date!));
      if (vencidos.length) {
        alertas.push({ tipo: "atraso", titulo: `${ent.alerta.frase} em atraso: ${vencidos.length === 1 ? vencidos[0].title : vencidos.length}`, detalhe: lista(vencidos), href, grave: true });
      }
    }
  }
  return alertas;
}

export const KINDS_COM_ALERTA = ENTIDADES.filter((e) => e.alerta).map((e) => e.kind);

// --------------------------------------------------------------- faculdade

/** Média ponderada (escala de 0 a 10) das avaliações que já têm nota. */
export function mediaDasAvaliacoes(avaliacoes: Registro[]) {
  let pesos = 0;
  let soma = 0;
  let comNota = 0;
  for (const a of avaliacoes) {
    const nota = a.data.nota;
    if (typeof nota !== "number") continue;
    const maxima = typeof a.data.nota_maxima === "number" && a.data.nota_maxima > 0 ? a.data.nota_maxima : 10;
    const peso = typeof a.data.peso === "number" && a.data.peso > 0 ? a.data.peso : 1;
    soma += (nota / maxima) * 10 * peso;
    pesos += peso;
    comNota++;
  }
  return { media: pesos ? Math.round((soma / pesos) * 100) / 100 : null, comNota, total: avaliacoes.length };
}

// ------------------------------------------------------------------ hábitos

export type RegistroDeHabito = Record<string, boolean>;

export function logDoHabito(r: Registro): RegistroDeHabito {
  const log = r.data.log;
  return log && typeof log === "object" ? (log as RegistroDeHabito) : {};
}

/** Dias seguidos até hoje (se hoje ainda não foi marcado, conta até ontem). */
export function sequencia(log: RegistroDeHabito, hoje: string) {
  let d = log[hoje] ? hoje : addDias(hoje, -1);
  let n = 0;
  while (log[d]) {
    n++;
    d = addDias(d, -1);
  }
  return n;
}

export function alternarDia(log: RegistroDeHabito, dia: string, hoje: string): RegistroDeHabito {
  const novo = { ...log };
  if (novo[dia]) delete novo[dia];
  else novo[dia] = true;
  // Guarda pouco mais de um ano de histórico.
  const corte = addDias(hoje, -400);
  for (const k of Object.keys(novo)) if (k < corte) delete novo[k];
  return novo;
}

export { entidade };
