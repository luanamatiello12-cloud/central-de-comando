/** Dinheiro: contas feitas em centavos inteiros, para não acumular erro de ponto flutuante. */

export const centavos = (reais: number) => Math.round(reais * 100);
export const reais = (cent: number) => Math.round(cent) / 100;

const FORMATO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function brl(valor: number) {
  // Sinal de menos tipográfico, sempre antes do "R$".
  return (valor < 0 ? "−" : "") + FORMATO.format(Math.abs(valor));
}

export function brlCurto(valor: number) {
  return (valor < 0 ? "−" : "") + "R$ " + COMPACTO.format(Math.abs(valor));
}

/** Lê "1.234,56", "1234,56", "1234.56" ou "R$ 80". Devolve null se não for um valor. */
export function lerValor(bruto: unknown): number | null {
  let s = String(bruto ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  if (virgula > -1 && ponto > -1) {
    // O separador que vem por último é o decimal.
    s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgula > -1) {
    s = s.replace(",", ".");
  } else if (ponto > -1 && /\.\d{3}$/.test(s) && s.indexOf(".") === ponto && s.length > 5) {
    // "12.500" sem vírgula: ponto de milhar.
    s = s.replace(".", "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
