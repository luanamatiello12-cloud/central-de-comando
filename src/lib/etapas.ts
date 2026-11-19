export type Etapa = {
  n: number;
  nome: string;
  entrega: string;
  estado: "concluida" | "em-andamento" | "pendente";
  /** Observação honesta sobre o que falta, mostrada no lugar da entrega. */
  nota?: string;
};

const FALTA_TESTE_BANCO = "Testado no modo local, tela por tela. Falta testar com o Supabase (login e acesso por outros aparelhos).";
const FALTA_TESTE_IA = "Telas e banco testados no modo local. A conversa com o agente ainda não foi testada: falta a chave de IA.";

/**
 * Plano do MVP. "em-andamento" aqui significa: construído, mas ainda não
 * testado de ponta a ponta com as contas reais. Mude para "concluida" depois
 * de conferir cada etapa funcionando.
 */
export const ETAPAS: Etapa[] = [
  { n: 0, nome: "Fundação", entrega: "Projeto, visual base, tema claro e escuro, navegação", estado: "concluida" },
  { n: 1, nome: "Login e dados", entrega: "Supabase Auth, ambientes separados, RLS, auditoria", estado: "em-andamento", nota: "Banco, ambientes e auditoria testados no modo local. O login só existe com o Supabase e ainda não foi testado." },
  { n: 2, nome: "Projetos, tarefas e calendário", entrega: "Cadastro completo, subtarefas, prioridades", estado: "em-andamento", nota: FALTA_TESTE_BANCO },
  { n: 3, nome: "Dashboard", entrega: "Resumo do dia, agenda, prioridades, atrasos", estado: "em-andamento", nota: FALTA_TESTE_BANCO },
  { n: 4, nome: "Agente central", entrega: "Conversa, ferramentas, confirmações, log", estado: "em-andamento", nota: FALTA_TESTE_IA },
  { n: 5, nome: "Memória", entrega: "Memória por ambiente e projeto, com tela de revisão", estado: "em-andamento", nota: FALTA_TESTE_IA },
  { n: 6, nome: "Proatividade", entrega: "Alertas, conflitos de agenda, relatório diário e semanal", estado: "em-andamento", nota: FALTA_TESTE_BANCO },
];
