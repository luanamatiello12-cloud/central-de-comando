"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Tema = "claro" | "escuro" | "sistema";
const ORDEM: Tema[] = ["sistema", "claro", "escuro"];
const ROTULO: Record<Tema, string> = {
  sistema: "Tema do sistema",
  claro: "Tema claro",
  escuro: "Tema escuro",
};
const EVENTO = "rumo:tema";

function lerTema(): Tema {
  try {
    const v = localStorage.getItem("tema");
    if (v === "claro" || v === "escuro") return v;
  } catch {}
  return "sistema";
}

function aplicar(tema: Tema) {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

// O tema salvo vive no navegador; o React só o observa.
function assinar(avisar: () => void) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const aoMudarSistema = () => {
    if (lerTema() === "sistema") aplicar("sistema");
  };
  const aoMudarOutraAba = () => {
    aplicar(lerTema());
    avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", aoMudarOutraAba);
  mq.addEventListener("change", aoMudarSistema);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", aoMudarOutraAba);
    mq.removeEventListener("change", aoMudarSistema);
  };
}

export function ThemeToggle() {
  const tema = useSyncExternalStore<Tema>(assinar, lerTema, () => "sistema");

  function proximo() {
    const novo = ORDEM[(ORDEM.indexOf(tema) + 1) % ORDEM.length];
    try {
      localStorage.setItem("tema", novo);
    } catch {}
    aplicar(novo);
    window.dispatchEvent(new Event(EVENTO));
  }

  const Icone = tema === "claro" ? Sun : tema === "escuro" ? Moon : Monitor;
  const rotulo = ROTULO[tema];

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={proximo}
      aria-label={`${rotulo}. Clique para trocar.`}
      title={`${rotulo} — clique para trocar`}
      className="justify-start gap-2 text-muted-foreground"
    >
      <Icone aria-hidden />
      <span className="max-md:sr-only">{rotulo}</span>
    </Button>
  );
}
