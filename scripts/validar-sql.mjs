// Valida a migração num Postgres local em memória (PGlite), com um esquema
// `auth` mínimo no lugar do Supabase, e testa o isolamento por usuário (RLS).
// Uso: node scripts/validar-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const db = new PGlite();
const ok = (m) => console.log("  ok  " + m);
const falha = (m) => {
  console.error("FALHA " + m);
  process.exitCode = 1;
};

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
`);

for (const f of fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
  ok("migração aplicada: " + f);
}

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@teste'), ('${B}', 'b@teste');`);

const como = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role;");
  }
};
const espera = (cond, m) => (cond ? ok(m) : falha(m));

let r = await como(A, "select slug, agent_access from workspaces order by sort");
espera(r.rows.length === 5, "novo usuário recebe 5 ambientes");
espera(r.rows.find((w) => w.slug === "ministerio")?.agent_access === false, "Ministério começa fora do alcance do agente");

const wsA = (await como(A, "select id from workspaces where slug = 'trabalho'")).rows[0].id;
const wsB = (await como(B, "select id from workspaces where slug = 'trabalho'")).rows[0].id;

const proj = (await como(A, `insert into projects (workspace_id, name) values ('${wsA}', 'Projeto A') returning id, last_activity_at`)).rows[0];
await como(A, `insert into tasks (workspace_id, project_id, title, due_date) values ('${wsA}', '${proj.id}', 'Tarefa A', current_date)`);
await como(A, `insert into events (workspace_id, title, event_date, start_time, end_time) values ('${wsA}', 'Reunião', current_date, '10:00', '11:00')`);
await como(A, `insert into memories (workspace_id, kind, content) values ('${wsA}', 'decisao', 'Decidimos usar Supabase no projeto')`);

r = await como(B, "select (select count(*) from projects) p, (select count(*) from tasks) t, (select count(*) from events) e, (select count(*) from memories) m, (select count(*) from audit_log) a");
espera(Object.values(r.rows[0]).every((v) => Number(v) === 0), "usuário B não enxerga nada do usuário A");

let negado = false;
try {
  await como(B, `insert into tasks (workspace_id, title) values ('${wsA}', 'invasão')`);
} catch {
  negado = true;
}
espera(negado, "B não consegue gravar no ambiente de A");

negado = false;
try {
  await como(B, `insert into tasks (workspace_id, user_id, title) values ('${wsB}', '${A}', 'em nome de A')`);
} catch {
  negado = true;
}
espera(negado, "B não consegue gravar em nome de A");

r = await como(B, `update tasks set title = 'alterada' where user_id = '${A}' returning id`);
espera(r.rows.length === 0, "B não consegue alterar tarefas de A");

r = await como(A, "select table_name, action, label from audit_log order by id");
espera(r.rows.length === 4 && r.rows[0].label === "Projeto A", "auditoria registra as 4 inserções de A");

negado = false;
try {
  await como(A, "insert into audit_log (user_id, table_name, row_id, action) values (auth.uid(), 'x', gen_random_uuid(), 'insert')");
} catch {
  negado = true;
}
espera(negado, "usuário não consegue forjar auditoria");

r = await como(A, "select id from memories where fts @@ websearch_to_tsquery('portuguese', 'projetos supabase')");
espera(r.rows.length === 1, "busca textual em português encontra a memória");

negado = false;
try {
  await como(A, `insert into events (workspace_id, title, event_date, start_time, end_time) values ('${wsA}', 'x', current_date, '11:00', '10:00')`);
} catch {
  negado = true;
}
espera(negado, "evento com fim antes do início é recusado");

await como(A, `update tasks set status = 'concluida', done_at = now() where project_id = '${proj.id}'`);
r = await como(A, `select last_activity_at > '${proj.last_activity_at.toISOString()}'::timestamptz as moveu from projects where id = '${proj.id}'`);
espera(r.rows[0].moveu === true, "mexer na tarefa atualiza a movimentação do projeto");

await db.exec(`delete from workspaces where user_id = '${B}' and slug = 'pessoal';`);
await como(B, "select garantir_ambientes()");
r = await como(B, "select count(*) n from workspaces");
espera(Number(r.rows[0].n) === 5, "garantir_ambientes recria o ambiente que faltava");

// ---- módulo financeiro
const finA = (await como(A, "select id from workspaces where slug = 'financeiro'")).rows[0].id;
await como(A, "insert into fin_settings (opening_balance, opening_date) values (1000, current_date)");
const fixa = (
  await como(
    A,
    `insert into fin_recurring (workspace_id, kind, description, amount, day_of_month, start_month) values ('${finA}', 'despesa', 'Internet', 119.90, 15, to_char(current_date, 'YYYY-MM')) returning id`,
  )
).rows[0].id;
const quitar = (descricao) =>
  como(
    A,
    `insert into fin_transactions (workspace_id, kind, description, amount, occurred_on, recurring_id, ref_month) values ('${finA}', 'despesa', '${descricao}', 119.90, current_date, '${fixa}', to_char(current_date, 'YYYY-MM'))`,
  );
await quitar("Internet");
negado = false;
try {
  await quitar("Internet de novo");
} catch {
  negado = true;
}
espera(negado, "conta fixa não pode ser quitada duas vezes no mesmo mês");

r = await como(B, "select (select count(*) from fin_transactions) t, (select count(*) from fin_recurring) f, (select count(*) from fin_settings) s");
espera(Object.values(r.rows[0]).every((v) => Number(v) === 0), "usuário B não enxerga as finanças de A");

negado = false;
try {
  await como(A, `insert into fin_transactions (workspace_id, kind, description, amount, occurred_on) values ('${finA}', 'despesa', 'negativo', -5, current_date)`);
} catch {
  negado = true;
}
espera(negado, "valor negativo é recusado");

r = await como(A, "select label from audit_log where table_name = 'fin_transactions'");
espera(r.rows.length === 1 && r.rows[0].label === "Internet", "lançamento entra na auditoria com a descrição");

console.log(process.exitCode ? "\nHá falhas." : "\nTudo certo.");
