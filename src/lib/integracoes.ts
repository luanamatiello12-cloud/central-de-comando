import "server-only";

export type Integracao = {
  nome: string;
  uso: string;
  configurada: boolean;
  falta: string;
  etapa: number;
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
      falta: "Preencher NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local",
      etapa: 1,
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
