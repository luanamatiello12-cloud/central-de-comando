import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada requisição e faz o redirecionamento
 * otimista. A checagem que vale é a do banco (RLS) e a de `getContexto()`.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const path = request.nextUrl.pathname;
  const ehApi = path.startsWith("/api/");

  if (!url || !key) {
    // Modo local (só em desenvolvimento): banco embutido, sem login.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    if (ehApi) return NextResponse.json({ erro: "Supabase não configurado." }, { status: 503 });
    if (path !== "/configurar") return NextResponse.redirect(new URL("/configurar", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publico = path === "/login" || path === "/configurar" || path.startsWith("/auth/");
  if (!user && !publico) {
    if (ehApi) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && path === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
