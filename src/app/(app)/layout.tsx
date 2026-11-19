import { AppNav } from "@/components/app/app-nav";
import { getContexto } from "@/lib/contexto";
import { modoLocal } from "@/lib/supabase/config";

// Todas as telas dependem do usuário logado: nunca pré-gerar no build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const c = await getContexto();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <AppNav ambientes={c.ambientes} atual={c.atual?.slug ?? null} email={c.user.email ?? ""} local={modoLocal()} />
      <main className="min-w-0 px-4 pt-6 pb-28 md:px-8 md:py-9">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
