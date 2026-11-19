import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { estadoDasIntegracoes, INTEGRACOES_FUTURAS } from "@/lib/integracoes";

/** Lê o estado a cada visita (não no build), para refletir o .env atual. */
export async function IntegracoesStatus({ comFuturas = false }: { comFuturas?: boolean }) {
  await connection();
  const lista = estadoDasIntegracoes();

  return (
    <ul className="flex flex-col divide-y divide-border">
      {lista.map((i) => (
        <li key={i.nome} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="font-medium">{i.nome}</p>
            <p className="text-sm text-muted-foreground">
              {i.uso}. Usada a partir da Etapa {i.etapa}.
            </p>
            {!i.configurada && <p className={cn("mt-1 text-sm [overflow-wrap:anywhere]", i.selo ? "text-muted-foreground" : "text-warning")}>{i.selo ? i.falta : `Falta: ${i.falta}`}</p>}
          </div>
          {i.configurada ? (
            <Badge className="bg-accent text-success">Chave presente</Badge>
          ) : (
            <Badge className={i.selo ? "bg-accent text-accent-foreground" : "bg-warning-soft text-warning"}>{i.selo ?? "Não configurada"}</Badge>
          )}
        </li>
      ))}
      {comFuturas &&
        INTEGRACOES_FUTURAS.map((nome) => (
          <li key={nome} className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <p className="font-medium">{nome}</p>
            <Badge variant="secondary">Ainda não construída</Badge>
          </li>
        ))}
    </ul>
  );
}

export function IntegracoesCarregando() {
  return <p className="text-sm text-muted-foreground">Verificando configuração…</p>;
}
