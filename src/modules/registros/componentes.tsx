import { Check } from "lucide-react";
import Link from "next/link";
import { campo, campoTexto, Enviar, Excluir, SelectAuto } from "@/components/app/form";
import { Badge } from "@/components/ui/badge";
import { addDias, diaDaSemana, fmtData, quando } from "@/lib/datas";
import { cn } from "@/lib/utils";
import { alternarHabito, atualizarRegistro, criarRegistro, definirSituacao, excluirRegistro } from "./actions";
import { moduloDe, type Campo, type Entidade } from "./esquemas";
import { dataEfetiva, encerrado, logDoHabito, resumoDoRegistro, sequencia, type Registro } from "./nucleo";

const rotuloCls = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground";

function CampoInput({ c, valor }: { c: Campo; valor?: unknown }) {
  const nome = "c_" + c.nome;
  const v = valor === null || valor === undefined ? "" : String(valor);
  const comum = { name: nome, defaultValue: c.tipo === "dinheiro" || c.tipo === "numero" ? v.replace(".", ",") : v, title: c.ajuda };
  let entrada: React.ReactNode;
  if (c.tipo === "longo") entrada = <textarea className={campoTexto} {...comum} placeholder={c.ajuda} />;
  else if (c.tipo === "select")
    entrada = (
      <select className={campo} {...comum}>
        <option value="">—</option>
        {c.opcoes!.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  else if (c.tipo === "data") entrada = <input className={campo} type="date" {...comum} />;
  else if (c.tipo === "hora") entrada = <input className={campo} type="time" {...comum} />;
  else if (c.tipo === "url") entrada = <input className={campo} type="url" inputMode="url" placeholder="https://" {...comum} />;
  else if (c.tipo === "numero" || c.tipo === "dinheiro") entrada = <input className={cn(campo, "font-mono")} inputMode="decimal" placeholder={c.tipo === "dinheiro" ? "R$ 0,00" : c.ajuda} {...comum} />;
  else entrada = <input className={campo} placeholder={c.ajuda} {...comum} />;
  return (
    <label className={cn(rotuloCls, c.tipo === "longo" ? "basis-full" : "flex-[1_1_180px]")}>
      {c.rotulo}
      {entrada}
    </label>
  );
}

type FormProps = {
  ent: Entidade;
  hoje: string;
  /** Edição: registro existente. Sem ele, o formulário cria. */
  registro?: Registro;
  /** Registros que podem ser o "pai" (para o seletor). */
  pais?: Registro[];
  /** Criação dentro da página de um pai: fica fixo e escondido. */
  paiFixo?: string;
};

/** Formulário de criar ou editar, montado a partir do esquema da entidade. */
export function FormRegistro({ ent, hoje, registro, pais = [], paiFixo }: FormProps) {
  const editando = Boolean(registro);
  const curtos = ent.campos.filter((c) => c.tipo !== "longo");
  // Ao criar, mostra o essencial e guarda o resto em "Mais campos".
  const visiveis = editando ? ent.campos : curtos.slice(0, 3);
  const extras = editando ? [] : ent.campos.filter((c) => !visiveis.includes(c));
  const valor = (c: Campo) => registro?.data[c.nome];

  return (
    <form action={editando ? atualizarRegistro : criarRegistro} className="flex flex-wrap items-end gap-2">
      {editando ? <input type="hidden" name="id" value={registro!.id} /> : <input type="hidden" name="kind" value={ent.kind} />}
      {paiFixo && <input type="hidden" name="parent_id" value={paiFixo} />}
      <label className={cn(rotuloCls, "flex-[2_1_240px]")}>
        {ent.titulo ?? "Título"}
        <input className={campo} name="title" defaultValue={registro?.title} required autoComplete="off" />
      </label>
      {ent.data && (
        <label className={rotuloCls}>
          {ent.data}
          <input className={campo} type="date" name="date" defaultValue={registro?.date ?? (ent.especial === "pesquisa" ? hoje : "")} />
        </label>
      )}
      {ent.status && (
        <label className={rotuloCls}>
          Situação
          <select className={campo} name="status" defaultValue={registro?.status || ent.status[0]}>
            {ent.status.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {ent.pai && !paiFixo && (
        <label className={cn(rotuloCls, "flex-[1_1_180px]")}>
          Pertence a
          <select className={campo} name="parent_id" defaultValue={registro?.parent_id ?? ""} required={ent.pai.obrigatorio}>
            <option value="">{ent.pai.obrigatorio ? "Escolha…" : "Nenhum"}</option>
            {pais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {visiveis.map((c) => (
        <CampoInput key={c.nome} c={c} valor={valor(c)} />
      ))}
      {extras.length > 0 && (
        <details className="basis-full">
          <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Mais campos</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {extras.map((c) => (
              <CampoInput key={c.nome} c={c} />
            ))}
          </div>
        </details>
      )}
      <Enviar enviando="Salvando…">{editando ? "Salvar" : "Adicionar"}</Enviar>
    </form>
  );
}

function Marcar({ ent, r }: { ent: Entidade; r: Registro }) {
  const feito = encerrado(ent, r);
  return (
    <form action={definirSituacao}>
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="status" value={feito ? ent.status![0] : ent.status![ent.status!.length - 1]} />
      <button
        type="submit"
        aria-label={feito ? `Desmarcar: ${r.title}` : `Marcar como feito: ${r.title}`}
        className={cn(
          "grid size-5 shrink-0 place-content-center rounded-md border-2 border-input bg-card text-primary-foreground transition-colors hover:border-primary",
          feito && "border-primary bg-primary",
        )}
      >
        {feito && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      </button>
    </form>
  );
}

function DataDoRegistro({ ent, r, hoje }: { ent: Entidade; r: Registro; hoje: string }) {
  const d = dataEfetiva(ent, r, hoje);
  if (!d) return null;
  if (encerrado(ent, r) || !ent.alerta) return <span>{ent.anual ? fmtData(d) : quando(d, hoje)}</span>;
  if (d < hoje) return <Badge className="bg-destructive/10 text-destructive">passou · {fmtData(d)}</Badge>;
  if (d === hoje) return <Badge className="bg-warning-soft text-warning">hoje</Badge>;
  if (d <= addDias(hoje, ent.alerta.dias)) return <Badge className="bg-warning-soft text-warning">{quando(d, hoje)}</Badge>;
  return <span>{quando(d, hoje)}</span>;
}

type ItemProps = { ent: Entidade; r: Registro; hoje: string; pai?: Registro; extra?: React.ReactNode };

/** Linha de um registro na lista: título (abre o detalhe), situação, data e resumo. */
export function ItemRegistro({ ent, r, hoje, pai, extra }: ItemProps) {
  const mod = moduloDe(ent.kind)!;
  const feito = encerrado(ent, r);
  const resumo = resumoDoRegistro(ent, r);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      {ent.marcavel && <Marcar ent={ent} r={r} />}
      <div className="min-w-0 flex-1 basis-48">
        <Link href={`/m/${mod.slug}/${r.id}`} className={cn("font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline", feito && "text-muted-foreground", feito && ent.marcavel && "line-through")}>
          {r.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <DataDoRegistro ent={ent} r={r} hoje={hoje} />
          {pai && <span>{pai.title}</span>}
          {resumo.map((t, i) => (
            <span key={i} className="[overflow-wrap:anywhere]">
              {t}
            </span>
          ))}
        </div>
      </div>
      {extra}
      {ent.status && !ent.marcavel && (
        <form action={definirSituacao}>
          <input type="hidden" name="id" value={r.id} />
          <SelectAuto name="status" defaultValue={r.status || ent.status[0]} aria-label={`Situação de ${r.title}`} className={cn(campo, "h-8 text-xs")}>
            {ent.status.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectAuto>
        </form>
      )}
      <form action={excluirRegistro}>
        <input type="hidden" name="id" value={r.id} />
        <Excluir rotulo={`Excluir: ${r.title}`} />
      </form>
    </li>
  );
}

const INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Hábito com os últimos 7 dias para marcar e a sequência atual. */
export function ItemHabito({ r, hoje }: { r: Registro; hoje: string }) {
  const log = logDoHabito(r);
  const dias = Array.from({ length: 7 }, (_, i) => addDias(hoje, i - 6));
  const ultimos30 = Array.from({ length: 30 }, (_, i) => addDias(hoje, -i)).filter((d) => log[d]).length;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <Link href={`/m/pessoal/${r.id}`} className="font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline">
          {r.title}
        </Link>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {typeof r.data.frequencia === "string" && r.data.frequencia && <span>{r.data.frequencia}</span>}
          <span className="font-mono tabular-nums">{ultimos30}/30 dias</span>
        </p>
      </div>
      <div className="flex gap-1">
        {dias.map((d) => (
          <form key={d} action={alternarHabito}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="dia" value={d} />
            <button
              type="submit"
              aria-pressed={Boolean(log[d])}
              aria-label={`${r.title} em ${fmtData(d)}`}
              title={fmtData(d, "semana")}
              className={cn(
                "grid size-7 place-content-center rounded-md border border-border bg-background font-mono text-[0.68rem] text-muted-foreground",
                log[d] && "border-primary bg-primary text-primary-foreground",
                d === hoje && "outline-2 outline-offset-1 outline-warning",
              )}
            >
              {INICIAIS[diaDaSemana(d)]}
            </button>
          </form>
        ))}
      </div>
      <span className="font-mono text-sm whitespace-nowrap text-warning tabular-nums">{sequencia(log, hoje)} seguidos</span>
    </li>
  );
}
