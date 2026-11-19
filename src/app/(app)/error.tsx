"use client";

import { Button } from "@/components/ui/button";

/** Erros de carregamento ou de uma ação aparecem aqui, com a opção de tentar de novo. */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-8">
      <h1 className="text-xl font-bold">Algo não funcionou</h1>
      <p className="text-muted-foreground">
        {error.digest
          ? "O servidor não conseguiu concluir a operação. Confira sua conexão e a configuração do Supabase em Ajustes."
          : error.message}
      </p>
      <Button onClick={reset}>Tentar de novo</Button>
    </div>
  );
}
