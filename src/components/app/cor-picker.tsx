"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** Paletas disponíveis. As cores de cada uma estão em src/app/globals.css. */
export const PALETAS = [
  { id: "oceano", nome: "Oceano", amostra: "#2447b8" },
  { id: "pinho", nome: "Pinho", amostra: "#1f5f4a" },
  { id: "vinho", nome: "Vinho", amostra: "#8a2846" },
  { id: "ambar", nome: "Âmbar", amostra: "#a8570a" },
  { id: "grafite", nome: "Grafite", amostra: "#2a303b" },
] as const;

const PADRAO = "oceano";
const EVENTO = "rumo:cor";

function lerCor(): string {
  try {
    const v = localStorage.getItem("cor");
    if (PALETAS.some((p) => p.id === v)) return v!;
  } catch {}
  return PADRAO;
}

function aplicar(cor: string) {
  if (cor === PADRAO) delete document.documentElement.dataset.cor;
  else document.documentElement.dataset.cor = cor;
}

// A paleta salva vive no navegador; o React só a observa.
function assinar(avisar: () => void) {
  const aoMudarOutraAba = () => {
    aplicar(lerCor());
    avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", aoMudarOutraAba);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", aoMudarOutraAba);
  };
}

/** Escolha da paleta de cores. `compacto` mostra só as bolinhas (menu lateral). */
export function CorPicker({ compacto = false }: { compacto?: boolean }) {
  const atual = useSyncExternalStore(assinar, lerCor, () => PADRAO);

  function escolher(cor: string) {
    try {
      localStorage.setItem("cor", cor);
    } catch {}
    aplicar(cor);
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <div role="radiogroup" aria-label="Paleta de cores" className={cn("flex flex-wrap", compacto ? "gap-1.5 px-2.5" : "gap-3")}>
      {PALETAS.map((p) => {
        const ativa = p.id === atual;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={ativa}
            aria-label={`Cor ${p.nome}`}
            title={p.nome}
            onClick={() => escolher(p.id)}
            className={cn(
              "group flex items-center gap-2 rounded-full transition-transform outline-offset-2 hover:scale-105",
              !compacto && "rounded-xl border border-border bg-card py-1.5 pr-3.5 pl-1.5 text-sm font-medium hover:scale-100 hover:bg-muted",
              !compacto && ativa && "border-primary ring-2 ring-primary/25",
            )}
          >
            <span
              className={cn("grid place-content-center rounded-full text-white", compacto ? "size-5" : "size-7", compacto && ativa && "ring-2 ring-foreground/60 ring-offset-2 ring-offset-card")}
              style={{ background: p.amostra }}
            >
              {ativa && <Check className={compacto ? "size-3" : "size-4"} strokeWidth={3} aria-hidden />}
            </span>
            {!compacto && p.nome}
          </button>
        );
      })}
    </div>
  );
}
