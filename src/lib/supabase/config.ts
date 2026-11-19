export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export function supabaseConfigurado() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Sem Supabase e fora de produção, o app roda no modo local: banco embutido
 * na pasta do projeto, um usuário só, sem login (ver src/lib/local/banco.ts).
 * Em produção isso nunca vale: sem chaves, o app pede a configuração.
 */
export function modoLocal() {
  return !supabaseConfigurado() && process.env.NODE_ENV !== "production";
}

export function bancoDisponivel() {
  return supabaseConfigurado() || modoLocal();
}
