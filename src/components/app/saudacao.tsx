"use client";

import { useSyncExternalStore } from "react";

function saudacao(h: number) {
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// O relógio é do aparelho de quem vê: o React só o observa, minuto a minuto.
const minutoAtual = () => Math.floor(Date.now() / 60_000);
function assinar(avisar: () => void) {
  const t = setInterval(avisar, 15_000);
  return () => clearInterval(t);
}

/**
 * Saudação, data e hora. No servidor fica neutra, porque ele não conhece
 * o fuso do navegador; o cliente preenche ao montar.
 */
export function Saudacao() {
  const minuto = useSyncExternalStore<number | null>(assinar, minutoAtual, () => null);
  const agora = minuto === null ? null : new Date(minuto * 60_000);

  const data = agora?.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hora = agora?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <p className="min-h-5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {agora ? (
          <>
            {data} · <span className="font-mono tabular-nums">{hora}</span>
          </>
        ) : (
          " "
        )}
      </p>
      <h1 className="text-3xl font-bold md:text-4xl">
        {agora ? `${saudacao(agora.getHours())}.` : "Olá."}
      </h1>
    </div>
  );
}
