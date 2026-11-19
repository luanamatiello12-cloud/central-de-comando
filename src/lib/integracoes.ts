import "server-only";
import { modoLocal } from "./supabase/config";

export type Integracao = {
  nome: string;
  uso: string;
  configurada: boolean;
  falta: string;
  etapa: number;
  /** Texto do selo quando não está configurada (padrão: "Não configurada"). */
  selo?: string;
};

const tem = (nome: string) => Boolean(process.env[nome]?.trim());

/**
 * Estado real de cada integração, lido das variáveis de ambiente do servidor.
 * Devolve só "configurada ou não" — nenhum valor de chave sai daqui.
 */
export function estadoDasIntegracoes(): Integracao[] {
  return [
    {
      nome: "Supabase",
      uso: "Banco de dados, login e arquivos",
      configurada: tem("NEXT_PUBLIC_SUPABASE_URL") && tem("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      falta: modoLocal()
        ? "O app está no modo local: seus dados ficam neste computador, na pasta .dados-locais, sem login. Para ter login e acessar de outros aparelhos, preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local. Os dados do modo local não são levados automaticamente."
        : "Preencher NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local",
      etapa: 1,
      selo: modoLocal() ? "Modo local" : undefined,
    },
    {
      nome: "Claude (Anthropic)",
      uso: "Agente central de IA",
      configurada: tem("ANTHROPIC_API_KEY"),
      falta: "Preencher ANTHROPIC_API_KEY no .env.local",
      etapa: 4,
    },
  ];
}

/** Integrações previstas que ainda não têm código. Mostradas como "não construída". */
export const INTEGRACOES_FUTURAS = [
  "Google Calendar",
  "Gmail",
  "Google Drive",
  "n8n",
  "WhatsApp Business",
];
