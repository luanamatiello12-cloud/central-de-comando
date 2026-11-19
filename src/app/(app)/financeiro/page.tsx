import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { campo, Enviar, Excluir } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto } from "@/lib/contexto";
import { fmtData, hojeISO, quando } from "@/lib/datas";
import { brl, brlCurto, lerValor } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import {
  aportarNaMeta,
  atualizarFixa,
  atualizarLancamento,
  atualizarMeta,
  criarFixa,
  criarLancamento,
  criarMeta,
  criarParcelamento,
  definirOrcamento,
  excluirFixa,
  excluirLancamento,
  excluirMeta,
  excluirParcelamento,
  quitarCompromisso,
  salvarSaldoInicial,
} from "@/modules/financeiro/actions";
import {
  addMeses,
  alertasFinanceiros,
  CATEGORIAS_DESPESA,
  CATEGORIAS_RECEITA,
  compromissosDoMes,
  gastosPorCategoria,
  lancamentosDoMes,
  livreAteRecebimento,
  mediaAvulsa,
  mesDe,
  nomeDoMes,
  parcelasPagas,
  planoDaMeta,
  projetar,
  rendaEFixos,
  resumoDoMes,
  simularCompra,
  type Compromisso,
  type Financas,
} from "@/modules/financeiro/calculos";
import { carregarFinancas } from "@/modules/financeiro/dados";

export const metadata: Metadata = { title: "Financeiro" };

const ABAS = [
  ["resumo", "Resumo"],
  ["lancamentos", "Lançamentos"],
  ["planejamento", "Planejamento"],
  ["metas", "Metas"],
  ["simulador", "Simulador"],
] as const;
type Aba = (typeof ABAS)[number][0];

const TODAS_CATEGORIAS = [...new Set([...CATEGORIAS_DESPESA, ...CATEGORIAS_RECEITA])];
const opcoes = (lista: string[], extra?: string) => [...new Set(extra && !lista.includes(extra) ? [...lista, extra] : lista)].map((c) => <option key={c}>{c}</option>);
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const vazio = "text-sm text-muted-foreground";
const rotulo = "text-xs font-semibold tracking-widest text-muted-foreground uppercase";
const tituloSecao = "text-lg font-bold";

export default async function Financeiro({ searchParams }: PageProps<"/financeiro">) {
  const c = await getContexto();
  const sp = await searchParams;
  const hoje = hojeISO();
  const aba: Aba = ABAS.some(([k]) => k === sp.aba) ? (sp.aba as Aba) : "resumo";
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesDe(hoje);
  const f = await carregarFinancas(c.supabase);

  const link = (a: Aba, m = mes) => `/financeiro?aba=${a}${m === mesDe(hoje) ? "" : `&mes=${m}`}`;

  return (
    <>
      <PageHeader titulo="Financeiro" descricao="Quanto você tem, o que já está comprometido e para onde o dinheiro vai." />

      <nav aria-label="Seções do Financeiro" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {ABAS.map(([k, nome]) => (
          <Link
            key={k}
            href={link(k)}
            aria-current={aba === k ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground", aba === k && "bg-card text-foreground shadow-xs")}
          >
            {nome}
          </Link>
        ))}
      </nav>

      {!f.config && (
        <Card className="border-warning">
          <CardContent>
            <h2 className={tituloSecao}>Para começar, informe quanto você tem hoje</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Some o que há nas suas contas e na carteira. A partir desse valor, o saldo acompanha cada lançamento. Sem ele, o saldo e as projeções partem de zero.
            </p>
            <SaldoInicialForm hoje={hoje} />
          </CardContent>
        </Card>
      )}

      {aba === "resumo" && <Resumo f={f} hoje={hoje} mes={mes} link={link} />}
      {aba === "lancamentos" && <Lancamentos f={f} hoje={hoje} mes={mes} link={link} />}
      {aba === "planejamento" && <Planejamento f={f} hoje={hoje} />}
      {aba === "metas" && <Metas f={f} hoje={hoje} />}
      {aba === "simulador" && <Simulador f={f} hoje={hoje} valor={lerValor(sp.valor)} parcelas={Number(sp.parcelas) || 1} juros={lerValor(sp.juros) ?? 0} />}
    </>
  );
}

type Base = { f: Financas; hoje: string };
type ComMes = Base & { mes: string; link: (a: Aba, m?: string) => string };

function SaldoInicialForm({ hoje, valor, data }: { hoje: string; valor?: number; data?: string }) {
  return (
    <form action={salvarSaldoInicial} className="flex flex-wrap gap-2">
      <input
        className={cn(campo, "w-44 font-mono")}
        name="opening_balance"
        inputMode="decimal"
        defaultValue={valor !== undefined ? String(valor).replace(".", ",") : ""}
        placeholder="Saldo (R$)"
        aria-label="Saldo"
        required
      />
      <input className={campo} type="date" name="opening_date" defaultValue={data ?? hoje} aria-label="Data do saldo" title="Data em que esse era o saldo" required />
      <Enviar>Salvar saldo</Enviar>
    </form>
  );
}

function NavMes({ mes, aba, link, hoje }: { mes: string; aba: Aba; link: ComMes["link"]; hoje: string }) {
  const botao = "grid size-8 place-content-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <nav aria-label="Mês" className="flex items-center gap-2">
      {mes !== mesDe(hoje) && (
        <Link href={link(aba, mesDe(hoje))} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
          Este mês
        </Link>
      )}
      <Link href={link(aba, addMeses(mes, -1))} aria-label="Mês anterior" className={botao}>
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <span className="inline-block min-w-28 text-center text-sm font-medium first-letter:uppercase">{fmtData(mes + "-15", "longa").split(" de ").slice(1).join(" de ")}</span>
      <Link href={link(aba, addMeses(mes, 1))} aria-label="Próximo mês" className={botao}>
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </nav>
  );
}

function NovoLancamento({ hoje }: { hoje: string }) {
  return (
    <form action={criarLancamento} className="flex flex-wrap gap-2">
      <select className={campo} name="kind" defaultValue="despesa" aria-label="Tipo">
        <option value="despesa">Saída</option>
        <option value="receita">Entrada</option>
      </select>
      <input className={cn(campo, "flex-[1_1_200px]")} name="description" placeholder="Descrição (ex.: supermercado)" aria-label="Descrição" required />
      <input className={cn(campo, "w-32 font-mono")} name="amount" inputMode="decimal" placeholder="R$ 0,00" aria-label="Valor" required />
      <select className={campo} name="category" defaultValue="Outros" aria-label="Categoria">
        {opcoes(TODAS_CATEGORIAS)}
      </select>
      <input className={campo} type="date" name="occurred_on" defaultValue={hoje} aria-label="Data" title="Data" />
      <Enviar enviando="Lançando…">Lançar</Enviar>
    </form>
  );
}

function ItemCompromisso({ c, hoje }: { c: Compromisso; hoje: string }) {
  const quitado = Boolean(c.lancamentoId);
  const vencido = !quitado && c.vencimento < hoje;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="[overflow-wrap:anywhere]">
          {c.descricao}
          {c.numero && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {" "}
              {c.numero}/{c.total}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {quitado ? (
            <Badge className="bg-accent text-success">{c.tipo === "receita" ? "recebida" : "paga"}</Badge>
          ) : vencido ? (
            <Badge className="bg-destructive/10 text-destructive">venceu {quando(c.vencimento, hoje)}</Badge>
          ) : c.vencimento === hoje ? (
            <Badge className="bg-warning-soft text-warning">vence hoje</Badge>
          ) : (
            <span>vence {quando(c.vencimento, hoje)}</span>
          )}
          <span>{c.categoria}</span>
        </div>
      </div>
      <span className={cn("font-mono tabular-nums", c.tipo === "receita" ? "text-success" : "")}>
        {c.tipo === "receita" ? "+" : "−"}
        {brl(c.valor)}
      </span>
      {quitado ? (
        <form action={excluirLancamento}>
          <input type="hidden" name="id" value={c.lancamentoId!} />
          <Enviar size="sm" variant="outline" enviando="Desfazendo…">
            Desfazer
          </Enviar>
        </form>
      ) : (
        <form action={quitarCompromisso}>
          <input type="hidden" name="origem" value={c.origem} />
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="mes" value={c.mes} />
          <Enviar size="sm" enviando="Lançando…">
            {c.tipo === "receita" ? "Receber" : "Pagar"}
          </Enviar>
        </form>
      )}
    </li>
  );
}

function Stat({ nome, valor, cor, children }: { nome: string; valor: number; cor?: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className={rotulo}>{nome}</span>
        <span className={cn("font-mono text-2xl tabular-nums", cor)}>{brl(valor)}</span>
        {children && <p className="text-xs text-muted-foreground">{children}</p>}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------- resumo

function Resumo({ f, hoje, mes, link }: ComMes) {
  const livre = livreAteRecebimento(f, hoje);
  const doMes = compromissosDoMes(f, mes);
  const aPagar = doMes.filter((c) => c.tipo === "despesa" && !c.lancamentoId).reduce((a, c) => a + c.valor, 0);
  const r = resumoDoMes(f, mes);
  const alertas = alertasFinanceiros(f, hoje);
  const projecao = projetar(f, hoje, 6);
  const { media, mesesBase } = mediaAvulsa(f, hoje);
  const maior = Math.max(1, ...projecao.map((m) => Math.abs(m.saldoFinal)));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat nome="Saldo hoje" valor={livre.saldo} cor={livre.saldo < 0 ? "text-destructive" : undefined}>
          {f.config ? `Desde ${fmtData(f.config.opening_date)}, com todos os lançamentos.` : "Saldo inicial ainda não informado."}
        </Stat>
        <Stat nome={`Livre até ${quando(livre.ate, hoje)}`} valor={livre.livre} cor={livre.livre < 0 ? "text-destructive" : "text-success"}>
          {livre.livre > 0
            ? `${brl(livre.porDia)} por dia, por ${livre.dias} ${livre.dias === 1 ? "dia" : "dias"}.`
            : livre.livre < 0
              ? "Os compromissos passam do saldo."
              : "Nada livre no momento."}
        </Stat>
        <Stat nome={`A pagar em ${nomeDoMes(mes)}`} valor={aPagar}>
          Contas fixas e parcelas ainda não pagas.
        </Stat>
        <Stat nome={`Resultado de ${nomeDoMes(mes)}`} valor={r.resultado} cor={r.resultado < 0 ? "text-destructive" : "text-success"}>
          Entrou {brl(r.entradas)}, saiu {brl(r.saidas)}.
        </Stat>
      </div>

      <p className="text-sm text-muted-foreground">
        <b className="text-foreground">Como o valor livre é calculado:</b> saldo de hoje ({brl(livre.saldo)}) menos {livre.comprometido.length}{" "}
        {livre.comprometido.length === 1 ? "conta" : "contas"} ({brl(livre.totalComprometido)}) que {livre.comprometido.length === 1 ? "vence" : "vencem"}{" "}
        {livre.proximoRecebimento
          ? `antes do próximo recebimento: ${livre.proximoRecebimento.descricao}, ${quando(livre.proximoRecebimento.vencimento, hoje)}.`
          : "até o fim do mês. Cadastre sua receita fixa em Planejamento para o cálculo ir até o próximo recebimento."}
      </p>

      {alertas.length > 0 && (
        <Card>
          <CardContent>
            <h2 className={cn(tituloSecao, "mb-2")}>Alertas</h2>
            <ul className="flex flex-col gap-2.5">
              {alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", a.grave ? "text-destructive" : "text-warning")} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">{a.titulo}</p>
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{a.detalhe}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <h2 className={cn(tituloSecao, "mb-2")}>Lançar entrada ou saída</h2>
          <NovoLancamento hoje={hoje} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className={tituloSecao}>Vencimentos do mês</h2>
            <NavMes mes={mes} aba="resumo" link={link} hoje={hoje} />
          </div>
          {doMes.length ? (
            <ul className="divide-y divide-border">
              {doMes.map((x) => (
                <ItemCompromisso key={x.origem + x.id} c={x} hoje={hoje} />
              ))}
            </ul>
          ) : (
            <p className={vazio}>
              Nenhuma conta fixa ou parcela neste mês. Cadastre salário, aluguel, parcelas e financiamentos em{" "}
              <Link href={link("planejamento")} className="font-medium text-primary underline-offset-4 hover:underline">
                Planejamento
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className={tituloSecao}>Projeção de saldo</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            Saldo ao fim de cada mês: parte do saldo de hoje e soma o que falta receber e pagar.{" "}
            {mesesBase > 0
              ? `Inclui uma estimativa de ${brl(media)} por mês em despesas avulsas, a média de ${mesesBase} ${mesesBase === 1 ? "mês" : "meses"} anteriores.`
              : "Ainda não há meses anteriores com lançamentos, então a projeção não estima despesas avulsas: conta só o que está cadastrado."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs tracking-widest text-muted-foreground uppercase">
                  <th className="py-1.5 font-semibold">Mês</th>
                  <th className="py-1.5 text-right font-semibold">A receber</th>
                  <th className="py-1.5 text-right font-semibold">A pagar</th>
                  <th className="py-1.5 text-right font-semibold">Avulsas (est.)</th>
                  <th className="py-1.5 text-right font-semibold">Saldo final</th>
                  <th className="w-1/4 py-1.5 pl-4 font-semibold" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projecao.map((m) => (
                  <tr key={m.mes}>
                    <td className="py-2 first-letter:uppercase">{nomeDoMes(m.mes)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{brl(m.entradas)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{brl(m.saidas)}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground tabular-nums">{brl(m.avulsasEstimadas)}</td>
                    <td className={cn("py-2 text-right font-mono font-medium tabular-nums", m.saldoFinal < 0 && "text-destructive")}>{brl(m.saldoFinal)}</td>
                    <td className="py-2 pl-4" aria-hidden>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", m.saldoFinal < 0 ? "bg-destructive" : "bg-primary")} style={{ width: `${(Math.abs(m.saldoFinal) / maior) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// --------------------------------------------------------------- lançamentos

function Lancamentos({ f, hoje, mes, link }: ComMes) {
  const doMes = lancamentosDoMes(f, mes);
  const r = resumoDoMes(f, mes);
  const categorias = gastosPorCategoria(f, mes);
  const maiorGasto = Math.max(1, ...categorias.map((g) => Math.max(g.gasto, g.limite ?? 0)));
  const serie = Array.from({ length: 6 }, (_, i) => addMeses(mes, i - 5)).map((m) => ({ m, ...resumoDoMes(f, m) }));
  const teto = Math.max(1, ...serie.map((s) => Math.max(s.entradas, s.saidas)));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Em {nomeDoMes(mes)}: entrou <b className="font-mono text-success">{brl(r.entradas)}</b>, saiu <b className="font-mono text-foreground">{brl(r.saidas)}</b>, resultado{" "}
          <b className={cn("font-mono", r.resultado < 0 ? "text-destructive" : "text-success")}>{brl(r.resultado)}</b>.
        </p>
        <NavMes mes={mes} aba="lancamentos" link={link} hoje={hoje} />
      </div>

      <Card>
        <CardContent>
          <NovoLancamento hoje={hoje} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className={tituloSecao}>Para onde foi</h2>
              <span className="text-xs text-muted-foreground">gasto / limite</span>
            </div>
            {categorias.length ? (
              <ul className="flex flex-col gap-2.5">
                {categorias.map((g) => (
                  <li key={g.categoria} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="truncate">{g.categoria}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", g.uso === null ? "bg-primary" : g.uso > 1 ? "bg-destructive" : g.uso >= 0.9 ? "bg-warning" : "bg-primary")}
                        style={{ width: `${Math.min(100, g.uso === null ? (g.gasto / maiorGasto) * 100 : g.uso * 100)}%` }}
                      />
                    </div>
                    <span className={cn("font-mono text-xs tabular-nums", g.uso !== null && g.uso > 1 && "text-destructive")}>
                      {brl(g.gasto)}
                      {g.limite !== null && ` / ${brl(g.limite)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={vazio}>Sem saídas neste mês.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className={tituloSecao}>Últimos 6 meses</h2>
              <span className="flex gap-3 text-xs text-muted-foreground">
                <span>
                  <i className="mr-1 inline-block size-2.5 rounded-sm bg-success" />
                  Entradas
                </span>
                <span>
                  <i className="mr-1 inline-block size-2.5 rounded-sm bg-destructive/80" />
                  Saídas
                </span>
                <span className="font-mono">topo: {brlCurto(teto)}</span>
              </span>
            </div>
            <div className="grid h-36 grid-cols-6 gap-2 border-b border-border" role="img" aria-label="Entradas e saídas dos últimos 6 meses">
              {serie.map((s) => (
                <div key={s.m} className="flex h-full items-end justify-center gap-1" title={`${nomeDoMes(s.m)}: entrou ${brl(s.entradas)}, saiu ${brl(s.saidas)}`}>
                  <i className="block w-3.5 rounded-t-sm bg-success" style={{ height: `${(s.entradas / teto) * 100}%`, minHeight: s.entradas ? 2 : 0 }} />
                  <i className="block w-3.5 rounded-t-sm bg-destructive/80" style={{ height: `${(s.saidas / teto) * 100}%`, minHeight: s.saidas ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-6 gap-2 text-center text-xs text-muted-foreground">
              {serie.map((s) => (
                <span key={s.m} className={cn(s.m === mes && "font-semibold text-foreground")}>
                  {nomeDoMes(s.m).split(" ")[0]}
                  <br />
                  <span className={cn("font-mono tabular-nums", s.resultado < 0 ? "text-destructive" : "text-success")}>{brlCurto(s.resultado)}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <h2 className={cn(tituloSecao, "mb-1")}>Lançamentos de {nomeDoMes(mes)}</h2>
          {doMes.length ? (
            <ul className="divide-y divide-border">
              {doMes.map((l) => (
                <li key={l.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="[overflow-wrap:anywhere]">{l.description}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{fmtData(l.occurred_on)}</span>
                        <span>{l.category}</span>
                        {l.recurring_id && <Badge variant="secondary">conta fixa</Badge>}
                        {l.installment_id && <Badge variant="secondary">parcela</Badge>}
                        {l.goal_id && <Badge variant="secondary">meta</Badge>}
                      </div>
                    </div>
                    <span className={cn("font-mono tabular-nums", l.kind === "receita" && "text-success")}>
                      {l.kind === "receita" ? "+" : "−"}
                      {brl(l.amount)}
                    </span>
                    <form action={excluirLancamento}>
                      <input type="hidden" name="id" value={l.id} />
                      <Excluir rotulo={`Excluir lançamento: ${l.description}`} />
                    </form>
                  </div>
                  <details className="mt-1">
                    <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Editar</summary>
                    <form action={atualizarLancamento} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <input className={cn(campo, "flex-[1_1_200px]")} name="description" defaultValue={l.description} aria-label="Descrição" required />
                      <input className={cn(campo, "w-32 font-mono")} name="amount" inputMode="decimal" defaultValue={String(l.amount).replace(".", ",")} aria-label="Valor" required />
                      <select className={campo} name="category" defaultValue={l.category} aria-label="Categoria">
                        {opcoes(TODAS_CATEGORIAS, l.category)}
                      </select>
                      <input className={campo} type="date" name="occurred_on" defaultValue={l.occurred_on} aria-label="Data" required />
                      <Enviar size="sm">Salvar</Enviar>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className={vazio}>Nenhum lançamento neste mês.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// -------------------------------------------------------------- planejamento

function Planejamento({ f, hoje }: Base) {
  const { renda, fixos, comprometimento } = rendaEFixos(f, hoje);
  const orcamento = gastosPorCategoria(f, mesDe(hoje)).filter((g) => g.limite !== null);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Em um mês cheio (o próximo): renda fixa de <b className="font-mono text-foreground">{brl(renda)}</b> e compromissos fixos de{" "}
        <b className="font-mono text-foreground">{brl(fixos)}</b>
        {comprometimento !== null && (
          <>
            , ou <b className="text-foreground">{pct(comprometimento)}</b> da renda
          </>
        )}
        .
      </p>

      <Card>
        <CardContent>
          <h2 className={tituloSecao}>Receitas e despesas fixas</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            O que se repete todo mês: salário, aluguel, internet. Se o dia já passou neste mês, a conta começa a valer no mês que vem.
          </p>
          <form action={criarFixa} className="flex flex-wrap gap-2">
            <select className={campo} name="kind" defaultValue="despesa" aria-label="Tipo">
              <option value="despesa">Despesa fixa</option>
              <option value="receita">Receita fixa</option>
            </select>
            <input className={cn(campo, "flex-[1_1_180px]")} name="description" placeholder="Nome (ex.: aluguel, salário)" aria-label="Nome" required />
            <input className={cn(campo, "w-32 font-mono")} name="amount" inputMode="decimal" placeholder="R$ 0,00" aria-label="Valor" required />
            <input className={cn(campo, "w-24 font-mono")} type="number" name="day_of_month" min={1} max={31} placeholder="Dia" aria-label="Dia do mês" required />
            <select className={campo} name="category" defaultValue="Contas" aria-label="Categoria">
              {opcoes(TODAS_CATEGORIAS)}
            </select>
            <Enviar enviando="Salvando…">Adicionar</Enviar>
          </form>
          {f.fixas.length > 0 && (
            <ul className="mt-2 divide-y divide-border">
              {f.fixas.map((x) => (
                <li key={x.id} className={cn("py-2.5", !x.active && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="[overflow-wrap:anywhere]">{x.description}</p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{x.kind === "receita" ? "receita" : "despesa"}</span>
                        <span>todo dia {x.day_of_month}</span>
                        <span>{x.category}</span>
                        {!x.active && <span>pausada</span>}
                        {x.active && x.start_month > mesDe(hoje) && <span>começa em {nomeDoMes(x.start_month)}</span>}
                      </p>
                    </div>
                    <span className={cn("font-mono tabular-nums", x.kind === "receita" && "text-success")}>
                      {x.kind === "receita" ? "+" : "−"}
                      {brl(x.amount)}
                    </span>
                    <form action={excluirFixa}>
                      <input type="hidden" name="id" value={x.id} />
                      <Excluir rotulo={`Excluir: ${x.description}`} />
                    </form>
                  </div>
                  <details className="mt-1">
                    <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Editar</summary>
                    <form action={atualizarFixa} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={x.id} />
                      <input className={cn(campo, "flex-[1_1_180px]")} name="description" defaultValue={x.description} aria-label="Nome" required />
                      <input className={cn(campo, "w-32 font-mono")} name="amount" inputMode="decimal" defaultValue={String(x.amount).replace(".", ",")} aria-label="Valor" required />
                      <input className={cn(campo, "w-24 font-mono")} type="number" name="day_of_month" min={1} max={31} defaultValue={x.day_of_month} aria-label="Dia do mês" required />
                      <select className={campo} name="category" defaultValue={x.category} aria-label="Categoria">
                        {opcoes(TODAS_CATEGORIAS, x.category)}
                      </select>
                      <select className={campo} name="active" defaultValue={x.active ? "1" : "0"} aria-label="Situação">
                        <option value="1">Ativa</option>
                        <option value="0">Pausada</option>
                      </select>
                      <Enviar size="sm">Salvar</Enviar>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className={tituloSecao}>Parcelas e financiamentos</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">Informe o que ainda falta pagar: quantas parcelas restam e quando vence a próxima.</p>
          <form action={criarParcelamento} className="flex flex-wrap gap-2">
            <select className={campo} name="kind" defaultValue="parcela" aria-label="Tipo">
              <option value="parcela">Compra parcelada</option>
              <option value="financiamento">Financiamento</option>
            </select>
            <input className={cn(campo, "flex-[1_1_180px]")} name="description" placeholder="O que é (ex.: notebook, carro)" aria-label="Descrição" required />
            <input className={cn(campo, "w-36 font-mono")} name="installment_amount" inputMode="decimal" placeholder="Valor da parcela" aria-label="Valor da parcela" required />
            <input className={cn(campo, "w-32 font-mono")} type="number" name="total_installments" min={1} max={600} placeholder="Restantes" aria-label="Parcelas restantes" required />
            <input className={campo} type="date" name="first_due" aria-label="Próximo vencimento" title="Próximo vencimento" required />
            <select className={campo} name="category" defaultValue="Dívidas" aria-label="Categoria">
              {opcoes(TODAS_CATEGORIAS)}
            </select>
            <Enviar enviando="Salvando…">Adicionar</Enviar>
          </form>
          {f.parcelamentos.length > 0 && (
            <ul className="mt-2 divide-y divide-border">
              {f.parcelamentos.map((p) => {
                const pagas = parcelasPagas(f, p);
                const restam = Math.max(0, p.total_installments - pagas);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="[overflow-wrap:anywhere]">{p.description}</p>
                      <div className="mt-1 h-1.5 max-w-56 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(pagas / p.total_installments) * 100}%` }} />
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{p.kind === "financiamento" ? "financiamento" : "compra parcelada"}</span>
                        <span className="font-mono tabular-nums">
                          {pagas}/{p.total_installments} pagas
                        </span>
                        <span>
                          faltam <span className="font-mono">{brl(restam * p.installment_amount)}</span>
                        </span>
                        <span>primeira em {fmtData(p.first_due)}</span>
                      </p>
                    </div>
                    <span className="font-mono tabular-nums">{brl(p.installment_amount)}/mês</span>
                    <form action={excluirParcelamento}>
                      <input type="hidden" name="id" value={p.id} />
                      <Excluir rotulo={`Excluir: ${p.description}`} />
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className={tituloSecao}>Orçamento por categoria</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">Limite de gasto por mês. Limite zero remove. O aviso aparece a partir de 90%.</p>
          <form action={definirOrcamento} className="flex flex-wrap gap-2">
            <select className={campo} name="category" defaultValue="Mercado" aria-label="Categoria">
              {opcoes(CATEGORIAS_DESPESA)}
            </select>
            <input className={cn(campo, "w-40 font-mono")} name="monthly_limit" inputMode="decimal" placeholder="Limite mensal" aria-label="Limite mensal" required />
            <Enviar enviando="Salvando…">Definir limite</Enviar>
          </form>
          {orcamento.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {orcamento.map((g) => (
                <li key={g.categoria} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <span className="truncate">{g.categoria}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", g.uso! > 1 ? "bg-destructive" : g.uso! >= 0.9 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, g.uso! * 100)}%` }} />
                  </div>
                  <span className={cn("font-mono text-xs tabular-nums", g.uso! > 1 && "text-destructive")}>
                    {brl(g.gasto)} / {brl(g.limite!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {f.config && (
        <Card>
          <CardContent>
            <h2 className={tituloSecao}>Saldo inicial</h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              O ponto de partida do saldo. Se o saldo do app se afastar do saldo real, informe aqui o valor de hoje: lançamentos anteriores à data deixam de contar.
            </p>
            <SaldoInicialForm hoje={hoje} valor={f.config.opening_balance} data={f.config.opening_date} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

// --------------------------------------------------------------------- metas

function Metas({ f, hoje }: Base) {
  return (
    <>
      <Card>
        <CardContent>
          <h2 className={cn(tituloSecao, "mb-3")}>Nova meta</h2>
          <form action={criarMeta} className="flex flex-wrap gap-2">
            <input className={cn(campo, "flex-[1_1_200px]")} name="name" placeholder="Meta (ex.: reserva de emergência)" aria-label="Nome da meta" required />
            <input className={cn(campo, "w-36 font-mono")} name="target_amount" inputMode="decimal" placeholder="Valor da meta" aria-label="Valor da meta" required />
            <input className={cn(campo, "w-36 font-mono")} name="saved_amount" inputMode="decimal" placeholder="Já guardado" aria-label="Já guardado" />
            <input className={campo} type="date" name="deadline" aria-label="Prazo" title="Prazo" />
            <Enviar enviando="Criando…">Criar meta</Enviar>
          </form>
        </CardContent>
      </Card>

      {f.metas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          Nenhuma meta ainda. Com valor e prazo, o app calcula quanto guardar por mês.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {f.metas.map((m) => {
            const p = planoDaMeta(m, hoje);
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 font-heading text-lg font-bold [overflow-wrap:anywhere]">{m.name}</h3>
                    <span className="font-mono tabular-nums">{p.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
                  </div>
                  <p className="font-mono text-sm tabular-nums">
                    {brl(m.saved_amount)} <span className="text-muted-foreground">de {brl(m.target_amount)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {p.falta === 0
                      ? "Meta atingida."
                      : p.vencida
                        ? `O prazo (${fmtData(m.deadline)}) passou e faltam ${brl(p.falta)}.`
                        : p.porMes !== null
                          ? `Faltam ${brl(p.falta)}. Para chegar até ${fmtData(m.deadline)}, guarde ${brl(p.porMes)} por mês, por ${p.meses} ${p.meses === 1 ? "mês" : "meses"}.`
                          : `Faltam ${brl(p.falta)}. Defina um prazo para ver quanto guardar por mês.`}
                  </p>
                  <form action={aportarNaMeta} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input className={cn(campo, "w-36 flex-1 font-mono")} name="amount" inputMode="decimal" placeholder="Guardar agora" aria-label={`Valor a guardar em ${m.name}`} required />
                    <Enviar size="sm" enviando="Guardando…">
                      Guardar
                    </Enviar>
                  </form>
                  <p className="text-xs text-muted-foreground">Guardar lança uma saída em Economias, então o saldo disponível diminui.</p>
                  <details>
                    <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Editar ou excluir</summary>
                    <form action={atualizarMeta} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <input className={cn(campo, "flex-[1_1_160px]")} name="name" defaultValue={m.name} aria-label="Nome" required />
                      <input className={cn(campo, "w-32 font-mono")} name="target_amount" inputMode="decimal" defaultValue={String(m.target_amount).replace(".", ",")} aria-label="Valor da meta" required />
                      <input className={cn(campo, "w-32 font-mono")} name="saved_amount" inputMode="decimal" defaultValue={String(m.saved_amount).replace(".", ",")} aria-label="Já guardado" />
                      <input className={campo} type="date" name="deadline" defaultValue={m.deadline ?? ""} aria-label="Prazo" />
                      <Enviar size="sm">Salvar</Enviar>
                    </form>
                    <form action={excluirMeta} className="mt-2">
                      <input type="hidden" name="id" value={m.id} />
                      <Excluir rotulo={`Excluir meta: ${m.name}`} />
                    </form>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ----------------------------------------------------------------- simulador

function Simulador({ f, hoje, valor, parcelas, juros }: Base & { valor: number | null; parcelas: number; juros: number }) {
  const n = Math.min(120, Math.max(1, Math.floor(parcelas)));
  const s = valor && valor > 0 ? simularCompra(f, hoje, valor, n, juros) : null;

  return (
    <>
      <Card>
        <CardContent>
          <h2 className={tituloSecao}>Simular uma compra</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">Nada é gravado: a simulação só mostra como a compra mexeria na sua projeção.</p>
          <form action="/financeiro" className="flex flex-wrap gap-2">
            <input type="hidden" name="aba" value="simulador" />
            <input className={cn(campo, "w-40 font-mono")} name="valor" inputMode="decimal" defaultValue={valor ? String(valor).replace(".", ",") : ""} placeholder="Valor da compra" aria-label="Valor da compra" required />
            <input className={cn(campo, "w-32 font-mono")} type="number" name="parcelas" min={1} max={120} defaultValue={n} aria-label="Número de parcelas" title="Número de parcelas" required />
            <input className={cn(campo, "w-40 font-mono")} name="juros" inputMode="decimal" defaultValue={juros ? String(juros).replace(".", ",") : ""} placeholder="Juros ao mês (%)" aria-label="Juros ao mês, em porcentagem" />
            <Enviar enviando="Calculando…">Simular</Enviar>
          </form>
        </CardContent>
      </Card>

      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat nome={n === 1 ? "Pagamento único" : `${n} parcelas de`} valor={s.parcela}>
              {n === 1 ? "No mês que vem." : `A primeira em ${nomeDoMes(mesDe(s.primeiroVencimento))}.`}
            </Stat>
            <Stat nome="Total pago" valor={s.totalPago}>
              {s.juros > 0 ? `${brl(s.juros)} de juros.` : "Sem juros."}
            </Stat>
            <Stat nome="Menor saldo projetado" valor={s.menorSaldo} cor={s.menorSaldo < 0 ? "text-destructive" : undefined}>
              No período simulado, com a compra.
            </Stat>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <span className={rotulo}>Renda comprometida</span>
                <span className="font-mono text-2xl tabular-nums">
                  {pct(s.comprometimentoAntes)} → {pct(s.comprometimentoDepois)}
                </span>
                <p className="text-xs text-muted-foreground">{s.rendaFixa > 0 ? "Compromissos fixos sobre a renda fixa mensal." : "Sem receita fixa cadastrada, não dá para calcular."}</p>
              </CardContent>
            </Card>
          </div>

          <p className={cn("rounded-xl border px-4 py-3 text-sm", s.primeiroMesNegativo ? "border-destructive/40 bg-destructive/5" : "border-border bg-card")}>
            {s.primeiroMesNegativo
              ? `Com essa compra, o saldo projetado fica negativo em ${nomeDoMes(s.primeiroMesNegativo)}.`
              : "Com essa compra, o saldo projetado não fica negativo no período simulado."}{" "}
            A projeção considera só o que está cadastrado e a estimativa de despesas avulsas. A decisão é sua.
          </p>

          <Card>
            <CardContent>
              <h2 className={cn(tituloSecao, "mb-2")}>Saldo ao fim de cada mês</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-xs tracking-widest text-muted-foreground uppercase">
                      <th className="py-1.5 font-semibold">Mês</th>
                      <th className="py-1.5 text-right font-semibold">Sem a compra</th>
                      <th className="py-1.5 text-right font-semibold">Com a compra</th>
                      <th className="py-1.5 text-right font-semibold">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {s.comCompra.map((m, i) => (
                      <tr key={m.mes}>
                        <td className="py-2 first-letter:uppercase">{nomeDoMes(m.mes)}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{brl(s.semCompra[i].saldoFinal)}</td>
                        <td className={cn("py-2 text-right font-mono font-medium tabular-nums", m.saldoFinal < 0 && "text-destructive")}>{brl(m.saldoFinal)}</td>
                        <td className="py-2 text-right font-mono text-muted-foreground tabular-nums">{brl(m.saldoFinal - s.semCompra[i].saldoFinal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
