import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/**
 * Cliente do Supabase com a sessão do usuário (cookies). Usa a chave pública:
 * quem decide o que cada um enxerga é o RLS do banco, não este código.
 */
export async function supabaseServer() {
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

export type Supabase = Awaited<ReturnType<typeof supabaseServer>>;
