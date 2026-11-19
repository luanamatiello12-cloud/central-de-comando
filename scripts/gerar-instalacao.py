"""Gera supabase/instalar.sql juntando as migrações, para colar de uma vez no SQL Editor do Supabase."""
import glob

# arquivo único de instalação do banco, gerado das migrações
partes = [
    "-- Rumo — instalação completa do banco no Supabase.\n"
    "-- GERADO a partir de supabase/migrations/ por `npm run sql:instalar`. Não edite à mão.\n"
    "-- Como usar: no painel do Supabase, abra o SQL Editor, cole este arquivo inteiro e execute uma vez.\n"
    "-- Em um banco que já tem as tabelas, não execute de novo: aplique só as migrações novas.\n"
]
for f in sorted(glob.glob("supabase/migrations/*.sql")):
    nome = f.replace("\\", "/").split("/")[-1]
    partes.append(f"\n-- ======================================================================\n-- {nome}\n-- ======================================================================\n\n" + open(f, encoding="utf-8").read().strip() + "\n")
open("supabase/instalar.sql", "w", encoding="utf-8", newline="\n").write("".join(partes))
print("ok", len(partes) - 1, "migrações")
