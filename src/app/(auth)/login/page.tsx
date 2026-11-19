import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { modoLocal, supabaseConfigurado } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default function Login() {
  if (modoLocal()) redirect("/");
  if (!supabaseConfigurado()) redirect("/configurar");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Rumo</h1>
        <p className="mt-1 text-muted-foreground">Entre para acessar sua central de comando.</p>
      </div>
      <LoginForm />
    </main>
  );
}
