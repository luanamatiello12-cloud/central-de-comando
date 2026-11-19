import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { modoLocal, SUPABASE_KEY, SUPABASE_URL } from "./config";

export type Supabase = SupabaseClient;

/**
 * Cliente do banco com a sessão do usuário (cookies). Usa a chave pública:
 * quem decide o que cada um enxerga é o RLS do banco, não este código.
 * No modo local, devolve o cliente do banco embutido, com a mesma forma de uso.
 */
export async function supabaseServer(): Promise<Supabase> {
  if (modoLocal()) {
    const { clienteLocal } = await import("@/lib/local/banco");
    return clienteLocal() as unknown as Supabase;
  }
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Em Server Components os cookies são somente leitura; o proxy renova a sessão.
        }
      },
    },
  });
}
