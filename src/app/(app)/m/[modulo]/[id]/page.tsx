import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Excluir } from "@/components/app/form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto } from "@/lib/contexto";
import { fmtData, hojeISO } from "@/lib/datas";
import { excluirRegistro } from "@/modules/registros/actions";
import { FormRegistro, ItemHabito, ItemRegistro } from "@/modules/registros/componentes";
import { buscarRegistro, filhosDe, listarRegistros } from "@/modules/registros/dados";
import { entidade, moduloPorSlug } from "@/modules/registros/esquemas";
import { encerrado, mediaDasAvaliacoes, ordenar, urlSegura } from "@/modules/registros/nucleo";

export const metadata: Metadata = { title: "Registro" };

export default async function RegistroPagina({ params }: PageProps<"/m/[modulo]/[id]">) {
  const { modulo, id } = await params;
  const mod = moduloPorSlug(modulo);
  if (!mod || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getContexto();
  const r = await buscarRegistro(c.supabase, id);
  const ent = r && entidade(r.kind);
  if (!r || !ent || !mod.entidades.includes(ent)) notFound();

  const hoje = hojeISO();
  const [filhos, pais] = await Promise.all([filhosDe(c.supabase, r.id), ent.pai ? listarRegistros(c.supabase, ent.pai.kinds) : Promise.resolve([])]);
  const pai = r.parent_id ? pais.find((p) => p.id === r.parent_id) : undefined;
  const voltar = pai ? `/m/${mod.slug}/${pai.id}` : `/m/${mod.slug}?e=${ent.soFilho ? mod.entidades[0].kind : ent.kind}`;
  const links = ent.campos.filter((x) => x.tipo === "url").flatMap((x) => (urlSegura(r.data[x.nome]) ? [{ rotulo: x.rotulo, href: urlSegura(r.data[x.nome])! }] : []));

  return (
    <>
      <Link href={voltar} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {pai ? pai.title : ent.soFilho ? mod.nome : ent.plural}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{ent.nome}</p>
          <h1 className="text-3xl font-bold [overflow-wrap:anywhere]">{r.title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {r.date && (
              <span>
                {ent.data}: {fmtData(r.date, "semana")}
              </span>
            )}
            {links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                {l.rotulo} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ))}
          </p>
        </div>
        {r.status && <Badge variant="secondary">{r.status}</Badge>}
      </header>

      {ent.especial === "habito" && (
        <Card>
          <CardContent>
            <ul>
              <ItemHabito r={r} hoje={hoje} />
            </ul>
          </CardContent>
        </Card>
      )}

      {(ent.filhos ?? []).map((kind) => {
        const filha = entidade(kind)!;
        const lista = ordenar(
          filha,
          filhos.filter((f) => f.kind === kind),
          hoje,
        );
        const feitos = lista.filter((f) => encerrado(filha, f)).length;
        const media = kind === "faculdade.avaliacao" ? mediaDasAvaliacoes(lista) : null;
        const vagas = kind === "ministerio.inscricao" && typeof r.data.vagas === "number" ? r.data.vagas : null;
        const ativos = kind === "ministerio.inscricao" ? lista.filter((f) => f.status !== "Desistiu").length : 0;
        return (
          <Card key={kind}>
            <CardContent>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold">{filha.plural}</h2>
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {media
                    ? media.media !== null
                      ? `média ${media.media.toLocaleString("pt-BR")} (${media.comNota} de ${media.total} com nota)`
                      : `${media.total} sem nota ainda`
                    : vagas !== null
                      ? `${ativos} de ${vagas} vagas`
                      : filha.marcavel && lista.length
                        ? `${feitos}/${lista.length} feitos`
                        : lista.length || ""}
                </span>
              </div>
              <FormRegistro ent={filha} hoje={hoje} paiFixo={r.id} />
              {lista.length > 0 && (
                <ul className="mt-2 divide-y divide-border">
                  {lista.map((f) => (
                    <ItemRegistro key={f.id} ent={filha} r={f} hoje={hoje} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-lg font-bold">Dados</h2>
          <FormRegistro ent={ent} hoje={hoje} registro={r} pais={pais} />
          <form action={excluirRegistro} className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="voltar" value={voltar} />
            <Excluir rotulo={`Excluir: ${r.title}`} />
            <span>{ent.filhos?.length ? "Excluir apaga também tudo o que pertence a este registro." : "Excluir este registro."}</span>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
