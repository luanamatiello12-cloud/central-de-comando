import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Chegada do link de confirmação enviado por e-mail no cadastro.
 * Troca o código pela sessão e leva ao painel. Se o link for aberto em outro
 * navegador (sem o cookie do cadastro), a troca falha, mas o e-mail já está
 * confirmado: a pessoa entra com a senha.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get("code");
  if (supabaseConfigurado() && codigo) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(new URL("/", origin));
  }
  return NextResponse.redirect(new URL("/login?aviso=confirmado", origin));
}
