/**
 * Script que roda durante a leitura do HTML, antes da primeira pintura.
 * No cliente vira text/plain para o React não reclamar nem executar de novo.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
