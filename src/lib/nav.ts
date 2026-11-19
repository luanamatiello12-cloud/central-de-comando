import {
  Bot,
  Brain,
  CalendarDays,
  FileBarChart,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Seções do MVP. Módulos novos entram aqui conforme forem construídos. */
export const NAV: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/agente", label: "Agente", icon: Bot },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/memoria", label: "Memória", icon: Brain },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { href: "/configuracoes", label: "Ajustes", icon: Settings },
];
