import "server-only";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Modo local: enquanto o Supabase não está configurado, o app usa um Postgres
 * embutido (PGlite) gravado em `.dados-locais/`, com as MESMAS migrações.
 * Um usuário só, sem login. Este arquivo imita a parte do cliente do Supabase
 * que o app usa, para que telas, ações e agente rodem sem mudar uma linha.
 *
 * Só vale em desenvolvimento, neste computador. Os dados daqui não vão
 * sozinhos para o Supabase quando ele for configurado.
 */
export const USUARIO_LOCAL = { id: "00000000-0000-4000-8000-000000000001", email: "modo local" };

type Erro = { message: string };
type Resposta = { data: unknown; error: Erro | null };

const g = globalThis as unknown as { __rumoBancoLocal?: Promise<PGlite> };

async function abrir(): Promise<PGlite> {
  const db = new PGlite(path.join(process.cwd(), ".dados-locais"));
  await db.waitReady;

  // O mínimo do esquema `auth` do Supabase de que as migrações dependem.
  await db.exec(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as
      $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    create table if not exists public._migracoes_locais (arquivo text primary key, aplicada_em timestamptz not null default now());
  `);

  const pasta = path.join(process.cwd(), "supabase", "migrations");
  const aplicadas = new Set((await db.query<{ arquivo: string }>("select arquivo from public._migracoes_locais")).rows.map((r) => r.arquivo));
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) {
    if (aplicadas.has(arquivo)) continue;
    await db.exec(fs.readFileSync(path.join(pasta, arquivo), "utf8"));
    await db.query("insert into public._migracoes_locais (arquivo) values ($1)", [arquivo]);
  }

  // A sessão inteira age como o usuário local (é o que auth.uid() devolve).
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USUARIO_LOCAL.id]);
  await db.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [USUARIO_LOCAL.id, USUARIO_LOCAL.email]);
  return db;
}

function banco() {
  return (g.__rumoBancoLocal ??= abrir().catch((e) => {
    g.__rumoBancoLocal = undefined;
    throw e;
  }));
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(nome: string) {
  if (!IDENT.test(nome)) throw new Error(`Nome inválido na consulta: ${nome}`);
  return `"${nome}"`;
}

/** "id, title, rotulo:name" -> `"id", "title", "name" as "rotulo"` */
function colunas(lista: string) {
  if (lista.trim() === "*") return "*";
  return lista
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [a, b] = c.split(":").map((x) => x.trim());
      return b ? `${ident(b)} as ${ident(a)}` : ident(a);
    })
    .join(", ");
}

const valor = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : (v ?? null));

/** Construtor de consultas com a mesma forma de uso do supabase-js. */
class Consulta implements PromiseLike<Resposta> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private cols = "*";
  private devolver = false;
  private linhas: Record<string, unknown>[] = [];
  private mudancas: Record<string, unknown> = {};
  private filtros: string[] = [];
  private params: unknown[] = [];
  private ordens: string[] = [];
  private limite?: number;
  private modo: "varias" | "uma" | "talvez" = "varias";

  constructor(private tabela: string) {}

  private p(v: unknown) {
    this.params.push(valor(v));
    return `$${this.params.length}`;
  }

  select(cols = "*") {
    this.cols = cols;
    if (this.op !== "select") this.devolver = true;
    return this;
  }
  insert(dados: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.linhas = Array.isArray(dados) ? dados : [dados];
    return this;
  }
  update(dados: Record<string, unknown>) {
    this.op = "update";
    this.mudancas = dados;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, v: unknown) {
    this.filtros.push(`${ident(col)}::text = ${this.p(v === null ? null : String(v))}`);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filtros.push(`${ident(col)}::text = any(${this.p(`{${vs.map((v) => `"${String(v).replace(/["\\]/g, "\\$&")}"`).join(",")}}`)}::text[])`);
    return this;
  }
  gte(col: string, v: unknown) {
    this.filtros.push(`${ident(col)}::text >= ${this.p(String(v))}`);
    return this;
  }
  lte(col: string, v: unknown) {
    this.filtros.push(`${ident(col)}::text <= ${this.p(String(v))}`);
    return this;
  }
  ilike(col: string, padrao: string) {
    this.filtros.push(`${ident(col)} ilike ${this.p(padrao)}`);
    return this;
  }
  not(col: string, operador: string, v: unknown) {
    if (operador !== "is" || v !== null) throw new Error("Filtro `not` não suportado no modo local.");
    this.filtros.push(`${ident(col)} is not null`);
    return this;
  }
  textSearch(col: string, consulta: string, opcoes: { type?: string; config?: string } = {}) {
    const config = opcoes.config ?? "simple";
    if (!IDENT.test(config)) throw new Error("Configuração de busca inválida.");
    const fn = opcoes.type === "websearch" ? "websearch_to_tsquery" : "plainto_tsquery";
    this.filtros.push(`${ident(col)} @@ ${fn}('${config}', ${this.p(consulta)})`);
    return this;
  }
  order(col: string, opcoes: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = opcoes.ascending !== false;
    const nulos = opcoes.nullsFirst === undefined ? "" : opcoes.nullsFirst ? " nulls first" : " nulls last";
    this.ordens.push(`${ident(col)} ${asc ? "asc" : "desc"}${nulos}`);
    return this;
  }
  limit(n: number) {
    this.limite = Math.max(0, Math.floor(n));
    return this;
  }
  single() {
    this.modo = "uma";
    return this;
  }
  maybeSingle() {
    this.modo = "talvez";
    return this;
  }

  private sql() {
    const t = `public.${ident(this.tabela)}`;
    const onde = this.filtros.length ? ` where ${this.filtros.join(" and ")}` : "";
    if (this.op === "select") {
      const ordem = this.ordens.length ? ` order by ${this.ordens.join(", ")}` : "";
      const lim = this.limite !== undefined ? ` limit ${this.limite}` : "";
      return `select ${colunas(this.cols)} from ${t}${onde}${ordem}${lim}`;
    }
    const volta = this.devolver ? ` returning ${colunas(this.cols)}` : "";
    if (this.op === "insert") {
      const chaves = Object.keys(this.linhas[0] ?? {});
      if (chaves.length === 0) return `insert into ${t} default values${volta}`;
      const tuplas = this.linhas.map((l) => `(${chaves.map((k) => this.p(l[k])).join(", ")})`);
      return `insert into ${t} (${chaves.map(ident).join(", ")}) values ${tuplas.join(", ")}${volta}`;
    }
    if (this.op === "update") {
      // Os valores do SET entram antes dos filtros na numeração: monta por último.
      const filtrosParams = this.params;
      this.params = [];
      const sets = Object.entries(this.mudancas).map(([k, v]) => `${ident(k)} = ${this.p(v)}`);
      const desloc = this.params.length;
      const ondeRenumerado = onde.replace(/\$(\d+)/g, (_, n) => `$${+n + desloc}`);
      this.params.push(...filtrosParams);
      return `update ${t} set ${sets.join(", ")}${ondeRenumerado}${volta}`;
    }
    return `delete from ${t}${onde}${volta}`;
  }

  private async executar(): Promise<Resposta> {
    try {
      const db = await banco();
      const sql = this.sql();
      if (this.op !== "select" && !this.devolver) {
        await db.query(sql, this.params);
        return { data: null, error: null };
      }
      // row_to_json devolve datas e horas como texto, igual à API do Supabase.
      const r = await db.query<{ r: Record<string, unknown> }>(`with q as (${sql}) select row_to_json(q) as r from q`, this.params);
      const linhas = r.rows.map((x) => x.r);
      if (this.modo === "varias") return { data: linhas, error: null };
      if (linhas.length === 1) return { data: linhas[0], error: null };
      if (linhas.length === 0 && this.modo === "talvez") return { data: null, error: null };
      return { data: null, error: { message: `Esperava um registro e vieram ${linhas.length}.` } };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : "Erro no banco local." } };
    }
  }

  then<A = Resposta, B = never>(ok?: ((v: Resposta) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.executar().then(ok, falha);
  }
}

/** Objeto com a mesma forma do cliente do Supabase usada pelo app. */
export function clienteLocal() {
  return {
    from: (tabela: string) => new Consulta(tabela),
    rpc: async (nome: string): Promise<Resposta> => {
      try {
        await (await banco()).query(`select public.${ident(nome)}()`);
        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : "Erro no banco local." } };
      }
    },
    auth: {
      getUser: async () => {
        await banco();
        return { data: { user: USUARIO_LOCAL }, error: null };
      },
      signOut: async () => ({ error: null }),
    },
  };
}
