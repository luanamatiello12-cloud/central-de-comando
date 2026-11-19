"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NAV } from "@/lib/nav";
import type { Ambiente } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { sair, trocarAmbiente } from "@/modules/conta/actions";
import { campo, SelectAuto } from "./form";
import { ThemeToggle } from "./theme-toggle";

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="11.5" fill="none" className="stroke-primary" strokeWidth="2" />
        <path d="M13 4 L16 13 L13 22 L10 13 Z" className="fill-primary" />
        <circle cx="13" cy="13" r="1.6" className="fill-background" />
      </svg>
      <span className="font-heading text-xl font-bold tracking-tight">Rumo</span>
    </Link>
  );
}

type Props = { ambientes: Ambiente[]; atual: string | null; email: string };

/** Escolhe de qual ambiente as telas mostram dados. "Todos" não mistura: só lista lado a lado. */
function SeletorDeAmbiente({ ambientes, atual, className }: Omit<Props, "email"> & { className?: string }) {
  return (
    <form action={trocarAmbiente} className={className}>
      <SelectAuto name="ambiente" defaultValue={atual ?? ""} aria-label="Ambiente" className={cn(campo, "w-full")}>
        <option value="">Todos os ambientes</option>
        {ambientes.map((a) => (
          <option key={a.id} value={a.slug}>
            {a.name}
          </option>
        ))}
      </SelectAuto>
    </form>
  );
}

/** Navegação lateral no computador; cabeçalho e barra inferior no celular. */
export function AppNav({ ambientes, atual, email }: Props) {
  const pathname = usePathname();

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 border-r border-border px-4 py-7 md:flex">
        <Marca />
        <SeletorDeAmbiente ambientes={ambientes} atual={atual} />
        <nav aria-label="Seções" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = ativo(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  on && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <p className="truncate px-2.5 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <ThemeToggle />
          <form action={sair}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut aria-hidden /> Sair
            </Button>
          </form>
        </div>
      </aside>

      <header className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
        <Marca />
        <SeletorDeAmbiente ambientes={ambientes} atual={atual} className="ml-auto min-w-0 flex-1" />
        <ThemeToggle />
        <form action={sair}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sair" title="Sair" className="text-muted-foreground">
            <LogOut aria-hidden />
          </Button>
        </form>
      </header>

      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-10 flex gap-1 overflow-x-auto border-t border-border bg-card px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = ativo(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-w-14 flex-1 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[0.65rem] text-muted-foreground",
                on && "text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
