import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Único ponto do app que conhece o provedor de IA. As ferramentas
 * (ferramentas.ts) e as instruções (instrucoes.ts) são neutras; para outro
 * provedor, escreva um adaptador equivalente ao de `api/agent/route.ts`.
 */
export const MODELO = process.env.AGENT_MODEL?.trim() || "claude-opus-5-5";

export function agenteConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let cliente: Anthropic | undefined;

/** A chave vem de ANTHROPIC_API_KEY, lida só no servidor. */
export function anthropic() {
  return (cliente ??= new Anthropic());
}
