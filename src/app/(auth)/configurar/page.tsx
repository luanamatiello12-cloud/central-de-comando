import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IntegracoesCarregando, IntegracoesStatus } from "@/components/app/integracoes-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseConfigurado } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Configurar" };

const PASSOS = [
  "Crie uma conta e um projeto gratuito em supabase.com.",
  "No painel do projeto, abra Project Settings > API e copie a Project URL e a Publishable key.",
  "Abra o arquivo .env.local na pasta do projeto e cole os dois valores em NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  "No painel do Supabase, abra o SQL Editor, cole o conteúdo de supabase/migrations/0001_base.sql e execute.",
  "Reinicie o servidor (npm run dev) e recarregue esta página.",
];

export default async function Configurar({ searchParams }: PageProps<"/configurar">) {
  const faltaBanco = (await searchParams).falta === "banco";
  const temChaves = supabaseConfigurado();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Falta configurar o Rumo</h1>
        <p className="mt-1 text-muted-foreground">
          {faltaBanco
            ? "As chaves do Supabase estão presentes, mas as tabelas não foram encontradas. Execute o passo 4 abaixo."
            : temChaves
              ? "As chaves do Supabase estão presentes."
              : "O aplicativo precisa de um banco de dados para guardar seus dados e fazer o login."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Passo a passo</CardTitle>
          <CardDescription>Nunca cole chaves em conversas ou no código: só no arquivo .env.local.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            {PASSOS.map((p) => (
              <li key={p} className="[overflow-wrap:anywhere]">
                {p}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Estado atual</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<IntegracoesCarregando />}>
            <IntegracoesStatus />
          </Suspense>
        </CardContent>
      </Card>

      {temChaves && (
        <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Tentar abrir o aplicativo
        </Link>
      )}
    </main>
  );
}
