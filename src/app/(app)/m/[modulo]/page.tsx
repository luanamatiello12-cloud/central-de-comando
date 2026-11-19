import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { agenteConfigurado } from "@/agent/provedor";
import { campo, Enviar } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-parts";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto } from "@/lib/contexto";
import { hojeISO } from "@/lib/datas";
import { cn } from "@/lib/utils";
import { iniciarPesquisa } from "@/modules/registros/actions";
import { FormRegistro, ItemHabito, ItemRegistro } from "@/modules/registros/componentes";
import { listarRegistros } from "@/modules/registros/dados";
import { CATEGORIAS_PESQUISA, moduloPorSlug, type Entidade } from "@/modules/registros/esquemas";
import { alertasDeRegistros, mediaDasAvaliacoes, ordenar, type Registro } from "@/modules/registros/nucleo";

export async function generateMetadata({ params }: PageProps<"/m/[modulo]">): Promise<Metadata> {
  return { title: moduloPorSlug((await params).modulo)?.nome ?? "Módulo" };
}

/** Pedido ao agente a partir de um critério de busca de oportunidades. */
function pedidoDoCriterio(r: Registro) {
  const d = r.data;
  const partes = [
    d.palavras && `palavras-chave: ${d.palavras}`,
    d.local && `local: ${d.local}`,
    d.modalidade && d.modalidade !== "Qualquer" && `modalidade: ${d.modalidade}`,
    d.escolaridade && `escolaridade: ${d.escolaridade}`,
    typeof d.salario_minimo === "number" && `salário a partir de R$ ${d.salario_minimo}`,
  ].filter(Boolean);
  return (
    `Pesquise na internet concursos, processos seletivos e vagas abertos agora para a busca "${r.title}" (${partes.join("; ") || "sem filtros"}). ` +
    "Para cada resultado, informe órgão ou empresa, salário, prazo de inscrição e o link da fonte com a data. Separe o que está confirmado do que não foi possível confirmar. " +
    "Não cadastre nada sem eu pedir: depois eu digo quais quero acompanhar."
  );
}

export default async function ModuloPagina({ params, searchParams }: PageProps<"/m/[modulo]">) {
  const mod = moduloPorSlug((await params).modulo);
  if (!mod) notFound();
  const c = await getContexto();
  const hoje = hojeISO();
  const abas = mod.entidades.filter((e) => !e.soFilho);
  const pedida = (await searchParams).e;
  const ent: Entidade = abas.find((e) => e.kind === pedida) ?? abas[0];

  const registros = await listarRegistros(
    c.supabase,
    mod.entidades.map((e) => e.kind),
  );
  const porId = new Map(registros.map((r) => [r.id, r]));
  const doTipo = ordenar(
    ent,
    registros.filter((r) => r.kind === ent.kind),
    hoje,
  );
  const pais = ent.pai ? registros.filter((r) => ent.pai!.kinds.includes(r.kind)).sort((a, b) => a.title.localeCompare(b.title, "pt-BR")) : [];
  const alertas = alertasDeRegistros(registros, hoje);
  const ambiente = c.ambientes.find((a) => a.slug === mod.ambiente);
  const iaAtiva = agenteConfigurado();

  return (
    <>
      <PageHeader titulo={mod.nome} descricao={mod.descricao} />

      {ambiente && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Dados no ambiente {ambiente.name}. {ambiente.agent_access ? "O agente pode consultar e alterar estes registros." : "O agente não tem acesso a este ambiente (você decide em Ajustes)."}
        </p>
      )}

      {abas.length > 1 && (
        <nav aria-label={`Seções de ${mod.nome}`} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {abas.map((e) => {
            const n = registros.filter((r) => r.kind === e.kind).length;
            return (
              <Link
                key={e.kind}
                href={`/m/${mod.slug}?e=${e.kind}`}
                aria-current={e.kind === ent.kind ? "page" : undefined}
                className={cn("rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground", e.kind === ent.kind && "bg-card text-foreground shadow-xs")}
              >
                {e.plural}
                {n > 0 && <span className="ml-1.5 font-mono text-xs tabular-nums opacity-70">{n}</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {alertas.length > 0 && (
        <Card>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", a.grave ? "text-destructive" : "text-warning")} aria-hidden />
                  <div className="min-w-0">
                    <Link href={a.href} className="font-medium underline-offset-4 hover:underline">
                      {a.titulo}
                    </Link>
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{a.detalhe}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {ent.especial === "pesquisa" && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-bold">Nova pesquisa com o agente</h2>
            {iaAtiva ? (
              <>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">O pedido abre na conversa do agente, já redigido. Você confere e envia.</p>
                <form action={iniciarPesquisa} className="flex flex-wrap gap-2">
                  <input className={cn(campo, "flex-[1_1_260px]")} name="pergunta" placeholder="O que você quer saber?" aria-label="O que pesquisar" required />
                  <select className={campo} name="categoria" defaultValue="" aria-label="Categoria">
                    <option value="">Categoria</option>
                    {CATEGORIAS_PESQUISA.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <Enviar enviando="Abrindo…">Pesquisar</Enviar>
                </form>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                A pesquisa na internet depende do agente, que ainda não está ativo: falta a chave de IA (veja em{" "}
                <Link href="/configuracoes" className="font-medium text-primary underline-offset-4 hover:underline">
                  Ajustes
                </Link>
                ). Enquanto isso, você pode guardar pesquisas feitas por conta própria no formulário abaixo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <h2 className="text-lg font-bold">
            {ent.especial === "pesquisa" ? "Guardar uma pesquisa" : `Adicionar: ${ent.nome.toLowerCase()}`}
          </h2>
          {ent.descricao && <p className="mt-1 text-sm text-muted-foreground">{ent.descricao}</p>}
          {ent.pai?.obrigatorio && pais.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Cadastre primeiro o registro ao qual este pertence, nas outras abas.</p>
          ) : (
            <div className="mt-3">
              <FormRegistro ent={ent} hoje={hoje} pais={pais} />
            </div>
          )}
        </CardContent>
      </Card>

      {doTipo.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">Nada cadastrado em {ent.plural.toLowerCase()} ainda.</p>
      ) : (
        <Card>
          <CardContent>
            <ul className="divide-y divide-border">
              {doTipo.map((r) => {
                if (ent.especial === "habito") return <ItemHabito key={r.id} r={r} hoje={hoje} />;
                let extra: React.ReactNode = null;
                if (ent.especial === "criterio" && iaAtiva) {
                  extra = (
                    <Link href={`/agente?q=${encodeURIComponent(pedidoDoCriterio(r))}`} className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
                      Pesquisar com o agente
                    </Link>
                  );
                }
                if (ent.kind === "faculdade.disciplina") {
                  const m = mediaDasAvaliacoes(registros.filter((x) => x.kind === "faculdade.avaliacao" && x.parent_id === r.id));
                  if (m.media !== null) extra = <span className="font-mono text-sm tabular-nums">média {m.media.toLocaleString("pt-BR")}</span>;
                }
                return <ItemRegistro key={r.id} ent={ent} r={r} hoje={hoje} pai={r.parent_id ? porId.get(r.parent_id) : undefined} extra={extra} />;
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {ent.especial === "criterio" && (
        <p className="text-sm text-muted-foreground">
          O monitoramento automático (o agente pesquisar sozinho de tempos em tempos) ainda não foi construído. Hoje a busca roda quando você pede
          {iaAtiva ? ", pelo botão de cada critério." : " e depende do agente, que ainda não está ativo."}
        </p>
      )}
    </>
  );
}
