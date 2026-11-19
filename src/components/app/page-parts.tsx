export function PageHeader({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <header>
      <h1 className="text-3xl font-bold md:text-4xl">{titulo}</h1>
      <p className="mt-1.5 max-w-2xl text-muted-foreground">{descricao}</p>
    </header>
  );
}
