import type { Metadata } from "next";
import Link from "next/link";
import { campo, campoTexto, Enviar, Excluir } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContexto, nomeDoAmbiente } from "@/lib/contexto";
import { fmtData } from "@/lib/datas";
import { ROTULO_MEMORIA, type Memoria } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { listarMemorias, listarProjetos } from "@/modules/dados";
import { atualizarMemoria, criarMemoria, excluirMemoria } from "@/modules/memoria/actions";

export const metadata: Metadata = { title: "Memória" };

const TIPOS = Object.entries(ROTULO_MEMORIA) as [Memoria["kind"], string][];

export default async function MemoriaPagina({ searchParams }: PageProps<"/memoria">) {
  const c = await getContexto();
  const q = String((await searchParams).q ?? "").trim();
  const [memorias, projetos] = await Promise.all([listarMemorias(c, q), listarProjetos(c)]);
  const nomeProjeto = new Map(projetos.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader titulo="Memória" descricao="O que o agente sabe sobre você entre uma conversa e outra. Você pode ver, corrigir e excluir tudo." />

      <Card>
        <CardContent>
          <form action={criarMemoria} className="flex flex-wrap gap-2">
            <textarea
              className={campoTexto}
              name="content"
              placeholder="Algo que o agente deve lembrar (ex.: prefiro reuniões pela manhã; decidimos usar o Supabase no projeto X)"
              aria-label="Nova memória"
              required
            />
            <select className={campo} name="kind" defaultValue="preferencia" aria-label="Tipo">
              {TIPOS.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <select className={campo} name="workspace_id" defaultValue={c.atual?.id ?? c.ambientes[0].id} aria-label="Ambiente">
              {c.ambientes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Enviar enviando="Guardando…">Guardar</Enviar>
          </form>
        </CardContent>
      </Card>

      <form className="flex gap-2" role="search">
        <input className={cn(campo, "flex-1")} type="search" name="q" defaultValue={q} placeholder="Buscar na memória" aria-label="Buscar na memória" />
        <Enviar variant="outline" enviando="Buscando…">
          Buscar
        </Enviar>
        {q && (
          <Link href="/memoria" className="self-center text-sm text-muted-foreground underline-offset-4 hover:underline">
            Limpar
          </Link>
        )}
      </form>

      {memorias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {q ? `Nada encontrado para “${q}”.` : "Nenhuma memória ainda. O agente guarda preferências e decisões conforme vocês conversam, e você pode escrever as suas acima."}
        </p>
      ) : (
        <Card>
          <CardContent>
            <ul className="divide-y divide-border">
              {memorias.map((m) => (
                <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge variant="secondary">{ROTULO_MEMORIA[m.kind]}</Badge>
                        <span>{nomeDoAmbiente(c, m.workspace_id)}</span>
                        {m.project_id && nomeProjeto.get(m.project_id) && <span>projeto {nomeProjeto.get(m.project_id)}</span>}
                        <span>{m.source === "agente" ? "guardada pelo agente" : "escrita por você"}</span>
                        <span>{fmtData(m.updated_at.slice(0, 10))}</span>
                      </div>
                    </div>
                    <form action={excluirMemoria}>
                      <input type="hidden" name="id" value={m.id} />
                      <Excluir rotulo="Excluir memória" />
                    </form>
                  </div>
                  <details className="mt-1">
                    <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Corrigir</summary>
                    <form action={atualizarMemoria} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <textarea className={campoTexto} name="content" defaultValue={m.content} aria-label="Texto da memória" required />
                      <select className={campo} name="kind" defaultValue={m.kind} aria-label="Tipo">
                        {TIPOS.map(([v, r]) => (
                          <option key={v} value={v}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <Enviar size="sm">Salvar</Enviar>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
