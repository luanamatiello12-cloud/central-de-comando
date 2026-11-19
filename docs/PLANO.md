# Plano do Rumo — central de comando pessoal

## Arquitetura

- **Aplicativo:** Next.js (App Router), TypeScript, Tailwind e shadcn/ui, com tema claro e escuro.
- **Dados:** Supabase (PostgreSQL, Auth, Storage). Toda tabela tem RLS.
- **Agente:** roda só no servidor, em `src/app/api/agent`, com streaming. Age por ferramentas que usam a sessão do usuário, então o RLS vale para ele também.
- **Chaves:** só em variáveis de ambiente do servidor (`.env.local`). Nunca com prefixo `NEXT_PUBLIC_`, exceto a URL e a chave pública do Supabase.
- **Ambientes separados:** Pessoal, Trabalho, Ministério, Acadêmico, Financeiro. O agente trabalha no ambiente da conversa; consultar outro exige autorização e fica registrado.
- **Ações sensíveis:** o agente propõe, o usuário confirma, o resultado vai para o log.

## Pastas

```
supabase/migrations/     SQL versionado: tabelas, RLS, índices
src/app/(auth)/          login e retorno do login (Etapa 1)
src/app/(app)/           telas do aplicativo
src/app/api/agent/       rota do agente (Etapa 4)
src/modules/<módulo>/    ações, consultas, validação e componentes de cada módulo
src/agent/               provedor de IA, ferramentas, memória, instruções
src/lib/                 utilitários, navegação, etapas, integrações
src/components/ui/       componentes shadcn/ui
src/components/app/      componentes próprios do aplicativo
```

## Banco de dados do MVP

| Tabela | Guarda |
|---|---|
| `profiles` | Dados do usuário e preferências |
| `workspaces` | Os ambientes separados |
| `projects` | Projetos: status, prioridade, prazo, última movimentação |
| `tasks` | Tarefas e subtarefas, ligadas ou não a um projeto |
| `events` | Compromissos do calendário |
| `conversations`, `messages` | Histórico das conversas (memória de curto prazo) |
| `memories` | Memória de longo prazo, por ambiente e por projeto |
| `agent_actions` | Log do que o agente executou e do que foi confirmado |
| `audit_log` | Histórico de alterações dos registros |
| `integrations` | Estado de cada integração |

## Etapas do MVP

O estado de cada etapa fica em `src/lib/etapas.ts` e aparece na tela inicial.

| Etapa | Entrega | Pronto quando |
|---|---|---|
| 0. Fundação | Projeto, visual base, tema, navegação | O app abre no localhost |
| 1. Login e dados | Supabase Auth, ambientes, RLS, auditoria | Você entra e só vê seus dados |
| 2. Projetos, tarefas, calendário | Cadastro completo, subtarefas, prioridades | Criar, editar e excluir ficam salvos |
| 3. Dashboard | Resumo do dia, agenda, prioridades, atrasos | Tudo vem do banco |
| 4. Agente central | Conversa, ferramentas, confirmações, log | "Cria uma tarefa para sexta" cria de verdade |
| 5. Memória | Memória por ambiente e projeto, com tela de revisão | O agente lembra de uma decisão em outra conversa |
| 6. Proatividade | Alertas, conflitos de agenda, relatórios | Os alertas aparecem no dashboard |

Depois do MVP: Financeiro e Vida pessoal, Trabalho avançado, Ministério, Faculdade, Carreira, Pesquisa. Integrações externas (Google, n8n, WhatsApp) por último.

## Decisões registradas

- **Provedor de IA:** começar só com Claude, atrás de uma interface própria em `src/agent/`. Adaptador da OpenAI quando for usado de fato.
- **Busca na memória:** busca textual em português do Postgres no MVP. Busca semântica depois, com um provedor de embeddings a escolher.
- **Ministério:** dados de terceiros e dado religioso são sensíveis pela LGPD. Mínimo de dados, fora do alcance do agente por padrão.
- **Fora do MVP:** voz, pagamentos, múltiplos usuários (o banco já comporta).

## Estado em 19/11/2026

O código das Etapas 1 a 6 está escrito. O que foi verificado e o que não foi:

- **Verificado:** a migração aplica num Postgres local e o isolamento entre usuários (RLS) passa em 12 testes (`npm run validar:sql`); a leitura de datas, os conflitos de agenda e os alertas passam em 23 testes (`npm run testar`); tipos, lint e build de produção passam; sem chaves, o app leva à tela `/configurar` e a rota do agente responde 503.
- **Não verificado:** login, telas com dados e o agente nunca rodaram contra um Supabase real nem contra a API de IA, porque as chaves ainda não existem. Espere ajustes na primeira execução.

## Como colocar para rodar

1. Criar um projeto em supabase.com e preencher `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no `.env.local`.
2. No SQL Editor do Supabase, executar `supabase/migrations/0001_base.sql`.
3. Criar uma chave em console.anthropic.com e preencher `ANTHROPIC_API_KEY`.
4. `npm run dev`, abrir http://localhost:3000 e criar a conta na tela de login.

## Decisões técnicas adicionais

- **Renderização:** todas as telas são dinâmicas (dependem do usuário). `cacheComponents` do Next foi desligado.
- **Calendário:** data e horários locais, sem fuso (`events.event_date`, `start_time`, `end_time`). O fuso do app fica em `NEXT_PUBLIC_APP_TZ`.
- **Agente:** Messages API da Anthropic com o tool runner do SDK, em `src/app/api/agent/route.ts`. As ferramentas (`src/agent/ferramentas.ts`) são neutras quanto ao provedor. Histórico entre turnos é só texto (últimas 30 mensagens).
- **Recusas:** nos modelos que aceitam, a rota ativa o fallback do servidor (`fallbacks: "default"`), que reexecuta o pedido em outro modelo se os filtros de segurança recusarem.
- **Exclusão pelo agente:** nunca direta. `solicitar_exclusao` grava uma ação pendente em `agent_actions`; a exclusão só acontece em `confirmarAcao`, disparada pelo usuário.
- **Acesso do agente:** `workspaces.agent_access` (Ministério começa bloqueado) e `conversations.allow_cross` (consulta a outros ambientes, por conversa).
- **Pesquisa na internet:** ferramenta de busca do próprio provedor (`web_search`), até 5 buscas por resposta. Cobrada à parte pela API.
