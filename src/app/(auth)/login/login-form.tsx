"use client";

import { useActionState, useState } from "react";
import { campo, Enviar } from "@/components/app/form";
import { entrarOuCadastrar, type EstadoLogin } from "@/modules/conta/actions";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const [estado, acao] = useActionState<EstadoLogin, FormData>(entrarOuCadastrar, {});
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="modo" value={modo} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <input className={cn(campo, "h-10")} type="email" name="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Senha
        <input
          className={cn(campo, "h-10")}
          type="password"
          name="senha"
          minLength={8}
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          required
        />
      </label>
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      {estado.aviso && (
        <p role="status" className="text-sm text-success">
          {estado.aviso}
        </p>
      )}
      <Enviar size="lg" enviando={modo === "entrar" ? "Entrando…" : "Criando conta…"}>
        {modo === "entrar" ? "Entrar" : "Criar conta"}
      </Enviar>
      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}
      >
        {modo === "entrar" ? "Ainda não tenho conta" : "Já tenho conta"}
      </button>
    </form>
  );
}
