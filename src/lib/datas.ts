/** Datas do app: tudo em ISO (AAAA-MM-DD) no fuso do usuário, sem depender do fuso do servidor. */

export const FUSO = process.env.NEXT_PUBLIC_APP_TZ || "America/Sao_Paulo";

const pad = (n: number) => String(n).padStart(2, "0");
const meioDia = (iso: string) => new Date(iso + "T12:00:00Z");

export function hojeISO(agora: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

export function horaAgora(agora: Date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).format(agora);
}

export function addDias(iso: string, n: number) {
  const d = meioDia(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diaDaSemana(iso: string) {
  return meioDia(iso).getUTCDay();
}

export function segundaDe(iso: string) {
  return addDias(iso, -((diaDaSemana(iso) + 6) % 7));
}

export function diasNoMes(mes: string) {
  return new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
}

export function ehDataISO(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = meioDia(s);
  // O JavaScript "rola" 31/02 para março; só vale se a data voltar igual.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function fmtData(iso: string | null | undefined, estilo: "curta" | "longa" | "semana" = "curta") {
  if (!iso) return "";
  const opcoes: Intl.DateTimeFormatOptions =
    estilo === "curta"
      ? { day: "2-digit", month: "short" }
      : estilo === "semana"
        ? { weekday: "short", day: "numeric", month: "short" }
        : { weekday: "long", day: "numeric", month: "long" };
  // Datas de outro ano mostram o ano, para "10 de nov" não parecer deste ano.
  const outroAno = iso.slice(0, 4) !== hojeISO().slice(0, 4);
  return meioDia(iso)
    .toLocaleDateString("pt-BR", { timeZone: "UTC", ...opcoes, ...(outroAno ? { year: "numeric" } : {}) })
    .replace(/\./g, "");
}

/** "hoje", "amanhã" ou a data por extenso curta. */
export function quando(iso: string, hoje: string = hojeISO()) {
  if (iso === hoje) return "hoje";
  if (iso === addDias(hoje, 1)) return "amanhã";
  if (iso === addDias(hoje, -1)) return "ontem";
  return fmtData(iso, "semana");
}

export function fmtHora(t: string | null | undefined) {
  return t ? t.slice(0, 5) : "";
}

export function diasEntre(deISO: string, ateISO: string) {
  return Math.round((meioDia(ateISO).getTime() - meioDia(deISO).getTime()) / 86_400_000);
}

const DIAS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terça: 2,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sábado: 6,
  sabado: 6,
};

export type TextoInterpretado = { titulo: string; data: string; hora: string };

/**
 * Lê data e hora escritas em texto livre: "dentista sexta 14h",
 * "pagar boleto amanhã", "renovar CNH dia 25", "aniversário 03/12".
 */
export function interpretarTexto(bruto: string, hoje: string = hojeISO()): TextoInterpretado {
  let s = " " + bruto + " ";
  let data = "";
  let hora = "";
  const pegar = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re);
    if (m && fn(m) !== false) s = s.replace(m[0], " ");
  };

  pegar(/\s(?:às|as)?\s*(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?=\s)/i, (m) => {
    const h = +m[1];
    const mi = +(m[2] || m[3] || 0);
    if (h > 23 || mi > 59) return false;
    hora = pad(h) + ":" + pad(mi);
  });
  pegar(/\sdepois de amanh[ãa](?=\s)/i, () => {
    data = addDias(hoje, 2);
  });
  if (!data) pegar(/\samanh[ãa](?=\s)/i, () => void (data = addDias(hoje, 1)));
  if (!data) pegar(/\shoje(?=\s)/i, () => void (data = hoje));
  if (!data)
    pegar(/\s(?:(?:na|no|nesta|neste|pr[óo]xim[ao])\s)*(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?(?=\s)/i, (m) => {
      const alvo = DIAS[m[1].toLowerCase()];
      data = addDias(hoje, (alvo - diaDaSemana(hoje) + 7) % 7 || 7);
    });
  if (!data)
    pegar(/\s(?:dia\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/i, (m) => {
      let ano = m[3] ? +m[3] : +hoje.slice(0, 4);
      if (ano < 100) ano += 2000;
      const mes = +m[2];
      const dia = +m[1];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
      data = `${ano}-${pad(mes)}-${pad(dia)}`;
      if (!m[3] && data < hoje) data = `${ano + 1}-${pad(mes)}-${pad(dia)}`;
      if (!ehDataISO(data)) {
        data = "";
        return false;
      }
    });
  if (!data)
    pegar(/\sdia\s(\d{1,2})(?=\s)/i, (m) => {
      const dia = +m[1];
      if (dia < 1 || dia > 31) return false;
      let mes = hoje.slice(0, 7);
      if (`${mes}-${pad(dia)}` < hoje) {
        const d = meioDia(mes + "-01");
        d.setUTCMonth(d.getUTCMonth() + 1);
        mes = d.toISOString().slice(0, 7);
      }
      data = `${mes}-${pad(Math.min(dia, diasNoMes(mes)))}`;
    });

  let titulo = s.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) titulo = titulo.replace(/\s+(às|as|na|no|em|de|dia|para|pra|até)$/i, "").trim();
  return { titulo: titulo || bruto.trim(), data, hora };
}
