"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Aparência única para input, select e textarea nativos. */
export const campo =
  "h-9 min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
export const campoTexto = cn(campo, "h-auto min-h-20 w-full py-2");

type BotaoProps = React.ComponentProps<typeof Button> & { enviando?: string };

/** Botão de envio que mostra o estado enquanto a ação roda no servidor. */
export function Enviar({ children, enviando = "Salvando…", ...props }: BotaoProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? enviando : children}
    </Button>
  );
}

/** Excluir em dois toques: o primeiro arma, o segundo confirma. Desarma sozinho. */
export function Excluir({ rotulo = "Excluir" }: { rotulo?: string }) {
  const [armado, setArmado] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);

  if (armado) {
    return (
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Excluindo…" : "Confirmar exclusão"}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={rotulo}
      title={rotulo}
      className="text-muted-foreground"
      onClick={() => setArmado(true)}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

/** Envia o formulário assim que o valor muda (seletores de ambiente, filtros). */
export function SelectAuto(props: React.ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
