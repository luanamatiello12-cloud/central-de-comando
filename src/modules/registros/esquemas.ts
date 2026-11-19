/**
 * Esquema dos módulos especializados. Cada módulo é uma lista de entidades;
 * cada entidade diz quais campos tem. Telas, validação, alertas e ferramentas
 * do agente são gerados a partir daqui: para criar um módulo ou um campo
 * novo, basta acrescentar neste arquivo.
 */

export type Campo = {
  nome: string;
  rotulo: string;
  tipo: "texto" | "longo" | "numero" | "dinheiro" | "data" | "hora" | "select" | "url";
  opcoes?: string[];
  ajuda?: string;
};

export type Entidade = {
  /** Identificador gravado no banco: "<módulo>.<entidade>". */
  kind: string;
  nome: string;
  plural: string;
  /** Rótulo do campo de título (padrão: "Título"). */
  titulo?: string;
  /** Situações possíveis; a primeira é a inicial. */
  status?: string[];
  /** Situações que encerram o registro (param de gerar alertas). */
  finais?: string[];
  /** Rótulo da data principal, quando a entidade tem uma. */
  data?: string;
  /** A data se repete todo ano (aniversários). */
  anual?: boolean;
  campos: Campo[];
  /** Registro ao qual este pode (ou precisa) estar ligado. */
  pai?: { kinds: string[]; obrigatorio?: boolean };
  /** Só existe dentro de um pai: não aparece como aba do módulo. */
  soFilho?: boolean;
  /** Entidades mostradas na página de detalhe deste registro. */
  filhos?: string[];
  /** Avisa quando a data está a até N dias. `atraso` avisa também depois de vencida. */
  alerta?: { dias: number; frase: string; atraso?: boolean };
  /** Mostra uma caixa de marcar que alterna entre a primeira e a última situação. */
  marcavel?: boolean;
  /** Campos mostrados na linha da lista (até três). */
  resumo?: string[];
  /** Tratamento próprio na tela. */
  especial?: "habito" | "pesquisa" | "criterio";
  descricao?: string;
};

export type Modulo = {
  slug: string;
  nome: string;
  descricao: string;
  /** Ambiente (slug) onde os dados deste módulo vivem. */
  ambiente: string;
  entidades: Entidade[];
};

const t = (nome: string, rotulo: string, ajuda?: string): Campo => ({ nome, rotulo, tipo: "texto", ajuda });
const longo = (nome: string, rotulo: string, ajuda?: string): Campo => ({ nome, rotulo, tipo: "longo", ajuda });
const sel = (nome: string, rotulo: string, opcoes: string[]): Campo => ({ nome, rotulo, tipo: "select", opcoes });
const url = (nome: string, rotulo: string): Campo => ({ nome, rotulo, tipo: "url" });
const num = (nome: string, rotulo: string, ajuda?: string): Campo => ({ nome, rotulo, tipo: "numero", ajuda });
const dinheiro = (nome: string, rotulo: string): Campo => ({ nome, rotulo, tipo: "dinheiro" });
const data = (nome: string, rotulo: string): Campo => ({ nome, rotulo, tipo: "data" });
const hora = (nome: string, rotulo: string): Campo => ({ nome, rotulo, tipo: "hora" });

export const CATEGORIAS_PESQUISA = [
  "Notícias",
  "Política e governo",
  "Inteligência artificial",
  "Tecnologia",
  "Concursos",
  "Legislação",
  "Finanças",
  "Viagens",
  "Serviços e fornecedores",
  "Benefícios e oportunidades",
];

export const MODULOS: Modulo[] = [
  {
    slug: "trabalho",
    nome: "Trabalho",
    descricao: "Reuniões e atas, demandas recebidas, responsáveis, documentos e o laboratório de inovação.",
    ambiente: "trabalho",
    entidades: [
      {
        kind: "trabalho.reuniao",
        nome: "Reunião",
        plural: "Reuniões",
        status: ["Agendada", "Realizada"],
        finais: ["Realizada"],
        data: "Data",
        alerta: { dias: 2, frase: "Reunião" },
        resumo: ["hora", "participantes", "projeto"],
        campos: [hora("hora", "Horário"), t("participantes", "Participantes"), t("projeto", "Projeto relacionado"), longo("pauta", "Pauta"), longo("ata", "Ata"), longo("decisoes", "Decisões")],
      },
      {
        kind: "trabalho.demanda",
        nome: "Demanda",
        plural: "Demandas",
        descricao: "Pedidos que chegam até você, com quem pediu e o prazo.",
        status: ["Nova", "Em andamento", "Concluída", "Recusada"],
        finais: ["Concluída", "Recusada"],
        data: "Prazo",
        alerta: { dias: 3, frase: "Prazo de demanda", atraso: true },
        resumo: ["solicitante", "prioridade"],
        campos: [t("solicitante", "Quem pediu"), sel("prioridade", "Prioridade", ["Normal", "Alta", "Baixa"]), longo("descricao", "Descrição")],
      },
      {
        kind: "trabalho.responsavel",
        nome: "Responsável",
        plural: "Responsáveis",
        titulo: "Nome",
        resumo: ["funcao", "contato"],
        campos: [t("funcao", "Função ou área"), t("contato", "Contato"), longo("observacoes", "Observações")],
      },
      {
        kind: "trabalho.documento",
        nome: "Documento",
        plural: "Documentos",
        resumo: ["tipo", "projeto"],
        campos: [url("link", "Link"), t("tipo", "Tipo"), t("projeto", "Projeto relacionado"), longo("observacoes", "Observações")],
      },
      {
        kind: "trabalho.lab",
        nome: "Experimento",
        plural: "Laboratório de inovação",
        descricao: "Ideias e experimentos com IA, automações, sistemas e APIs.",
        status: ["Ideia", "Experimentando", "Em uso", "Arquivado"],
        resumo: ["ferramenta"],
        campos: [sel("ferramenta", "Ferramenta", ["Inteligência artificial", "Automação", "n8n", "Claude", "Gemini", "Supabase", "API", "Sistema", "Outra"]), url("link", "Link"), longo("anotacoes", "Anotações")],
      },
    ],
  },
  {
    slug: "ministerio",
    nome: "Ministério",
    descricao: "Grupos e lideranças, pessoas em formação, encontros, estudos bíblicos, eventos e metas.",
    ambiente: "ministerio",
    entidades: [
      {
        kind: "ministerio.grupo",
        nome: "Grupo",
        plural: "Grupos",
        titulo: "Nome do grupo",
        descricao: "PGs, GDs e equipes. Cada grupo guarda suas pessoas e seus encontros.",
        status: ["Ativo", "Pausado", "Multiplicado"],
        resumo: ["tipo", "lider", "encontro"],
        filhos: ["ministerio.pessoa", "ministerio.encontro"],
        campos: [sel("tipo", "Tipo", ["PG", "GD", "Equipe", "Outro"]), t("lider", "Líder"), t("encontro", "Dia e horário"), t("local", "Local"), longo("observacoes", "Observações")],
      },
      {
        kind: "ministerio.pessoa",
        nome: "Pessoa",
        plural: "Pessoas",
        titulo: "Nome",
        descricao: "Líderes, líderes em treinamento e membros, com a caminhada de cada um.",
        pai: { kinds: ["ministerio.grupo"] },
        resumo: ["papel", "etapa"],
        campos: [
          sel("papel", "Papel", ["Membro", "Líder", "Líder em treinamento", "Auxiliar", "Visitante"]),
          sel("etapa", "Etapa de integração", ["Visitante", "Frequentando", "Integrado", "Batizado", "Servindo"]),
          t("contato", "Contato"),
          data("batismo", "Data do batismo"),
          longo("formacao", "Formação e treinamentos"),
          longo("acompanhamento", "Acompanhamento", "Anotações da caminhada, pedidos de oração, próximos passos."),
        ],
      },
      {
        kind: "ministerio.encontro",
        nome: "Encontro",
        plural: "Encontros",
        status: ["Planejado", "Realizado"],
        finais: ["Realizado"],
        data: "Data",
        pai: { kinds: ["ministerio.grupo"] },
        alerta: { dias: 3, frase: "Encontro" },
        resumo: ["tema"],
        campos: [t("tema", "Tema ou estudo"), longo("planejamento", "Planejamento"), longo("observacoes", "Como foi")],
      },
      {
        kind: "ministerio.estudo",
        nome: "Estudo bíblico",
        plural: "Estudos bíblicos",
        status: ["Rascunho", "Pronto", "Ministrado"],
        resumo: ["referencia", "serie"],
        campos: [t("referencia", "Referência bíblica"), t("serie", "Série"), longo("anotacoes", "Anotações")],
      },
      {
        kind: "ministerio.evento",
        nome: "Evento",
        plural: "Eventos",
        status: ["Planejando", "Inscrições abertas", "Realizado"],
        finais: ["Realizado"],
        data: "Data",
        alerta: { dias: 7, frase: "Evento" },
        resumo: ["local", "responsavel"],
        filhos: ["ministerio.inscricao"],
        campos: [t("local", "Local"), t("responsavel", "Responsável"), num("vagas", "Vagas"), longo("planejamento", "Planejamento e equipes")],
      },
      {
        kind: "ministerio.inscricao",
        nome: "Inscrição",
        plural: "Inscrições",
        titulo: "Nome",
        soFilho: true,
        pai: { kinds: ["ministerio.evento"], obrigatorio: true },
        status: ["Inscrito", "Confirmado", "Presente", "Desistiu"],
        resumo: ["contato"],
        campos: [t("contato", "Contato")],
      },
      {
        kind: "ministerio.meta",
        nome: "Meta",
        plural: "Metas",
        descricao: "Alvos de crescimento e multiplicação, descritos em palavras.",
        status: ["Em andamento", "Alcançada"],
        finais: ["Alcançada"],
        data: "Prazo",
        campos: [longo("descricao", "Descrição")],
      },
    ],
  },
  {
    slug: "faculdade",
    nome: "Faculdade",
    descricao: "Cursos, disciplinas, provas e trabalhos, notas, materiais e portfólio.",
    ambiente: "academico",
    entidades: [
      {
        kind: "faculdade.disciplina",
        nome: "Disciplina",
        plural: "Disciplinas",
        titulo: "Nome da disciplina",
        status: ["Cursando", "Aprovada", "Reprovada"],
        pai: { kinds: ["faculdade.curso"] },
        resumo: ["semestre", "professor", "horario"],
        filhos: ["faculdade.avaliacao", "faculdade.material"],
        campos: [t("semestre", "Semestre", "Ex.: 2026.2"), t("professor", "Professor"), t("horario", "Dia e horário")],
      },
      {
        kind: "faculdade.avaliacao",
        nome: "Prova ou trabalho",
        plural: "Provas e trabalhos",
        status: ["Pendente", "Entregue", "Corrigida"],
        finais: ["Entregue", "Corrigida"],
        data: "Data",
        pai: { kinds: ["faculdade.disciplina"], obrigatorio: true },
        alerta: { dias: 5, frase: "Prova ou trabalho", atraso: true },
        resumo: ["tipo", "nota"],
        campos: [sel("tipo", "Tipo", ["Prova", "Trabalho", "Seminário", "Outro"]), num("peso", "Peso", "Padrão: 1"), num("nota", "Nota"), num("nota_maxima", "Nota máxima", "Padrão: 10")],
      },
      {
        kind: "faculdade.material",
        nome: "Material",
        plural: "Materiais",
        pai: { kinds: ["faculdade.disciplina"] },
        resumo: ["tipo"],
        campos: [url("link", "Link"), t("tipo", "Tipo"), longo("resumo", "Resumo ou anotações")],
      },
      {
        kind: "faculdade.curso",
        nome: "Curso",
        plural: "Cursos e certificados",
        titulo: "Nome do curso",
        status: ["Cursando", "Concluído", "Trancado"],
        data: "Início",
        resumo: ["instituicao", "tipo"],
        filhos: ["faculdade.disciplina"],
        campos: [t("instituicao", "Instituição"), sel("tipo", "Tipo", ["Graduação", "Pós-graduação", "Curso livre", "Certificação"]), url("certificado", "Link do certificado")],
      },
      {
        kind: "faculdade.portfolio",
        nome: "Projeto",
        plural: "Portfólio",
        data: "Data",
        resumo: ["tecnologias"],
        campos: [url("link", "Link"), t("tecnologias", "Tecnologias"), longo("descricao", "Descrição")],
      },
    ],
  },
  {
    slug: "carreira",
    nome: "Carreira",
    descricao: "Concursos, processos seletivos e vagas, com prazos, candidaturas, currículo e preparação.",
    ambiente: "pessoal",
    entidades: [
      {
        kind: "carreira.oportunidade",
        nome: "Oportunidade",
        plural: "Oportunidades",
        status: ["Acompanhando", "Inscrito", "Em processo", "Aprovado", "Encerrado", "Descartado"],
        finais: ["Aprovado", "Encerrado", "Descartado"],
        data: "Prazo de inscrição",
        alerta: { dias: 5, frase: "Prazo de inscrição" },
        resumo: ["tipo", "orgao", "salario"],
        campos: [
          sel("tipo", "Tipo", ["Concurso", "Processo seletivo", "Vaga"]),
          t("orgao", "Órgão ou empresa"),
          dinheiro("salario", "Salário"),
          t("escolaridade", "Escolaridade"),
          t("local", "Local"),
          sel("modalidade", "Modalidade", ["Presencial", "Híbrido", "Remoto"]),
          data("prova", "Data da prova ou etapa"),
          url("link", "Link do edital ou da vaga"),
          longo("observacoes", "Observações"),
        ],
      },
      {
        kind: "carreira.criterio",
        nome: "Critério de busca",
        plural: "Critérios de busca",
        titulo: "Nome da busca",
        especial: "criterio",
        descricao: "O que você procura. O agente usa estes critérios para pesquisar quando você pedir.",
        resumo: ["palavras", "local", "modalidade"],
        campos: [
          t("palavras", "Palavras-chave"),
          dinheiro("salario_minimo", "Salário mínimo"),
          t("escolaridade", "Escolaridade"),
          t("local", "Local"),
          sel("modalidade", "Modalidade", ["Qualquer", "Presencial", "Híbrido", "Remoto"]),
        ],
      },
      {
        kind: "carreira.curriculo",
        nome: "Item do currículo",
        plural: "Currículo",
        resumo: ["tipo", "instituicao", "periodo"],
        campos: [sel("tipo", "Tipo", ["Experiência", "Formação", "Curso", "Certificação", "Habilidade", "Idioma"]), t("instituicao", "Instituição ou empresa"), t("periodo", "Período"), longo("descricao", "Descrição")],
      },
      {
        kind: "carreira.entrevista",
        nome: "Entrevista",
        plural: "Entrevistas",
        status: ["Preparando", "Feita"],
        finais: ["Feita"],
        data: "Data",
        alerta: { dias: 3, frase: "Entrevista" },
        resumo: ["empresa"],
        campos: [t("empresa", "Empresa ou órgão"), longo("anotacoes", "Perguntas e anotações")],
      },
    ],
  },
  {
    slug: "pessoal",
    nome: "Vida pessoal",
    descricao: "Hábitos, datas importantes, viagens, listas, manutenção de veículos, documentos e objetivos.",
    ambiente: "pessoal",
    entidades: [
      {
        kind: "pessoal.habito",
        nome: "Hábito",
        plural: "Hábitos",
        titulo: "Hábito",
        especial: "habito",
        campos: [t("frequencia", "Frequência desejada", "Ex.: todo dia, 3 vezes por semana")],
      },
      {
        kind: "pessoal.data",
        nome: "Data importante",
        plural: "Datas importantes",
        titulo: "Nome",
        data: "Data",
        anual: true,
        alerta: { dias: 7, frase: "Data importante" },
        resumo: ["tipo"],
        campos: [sel("tipo", "Tipo", ["Aniversário", "Data especial"]), t("observacao", "Observação")],
      },
      {
        kind: "pessoal.lista",
        nome: "Lista",
        plural: "Listas e compras",
        resumo: ["tipo"],
        filhos: ["pessoal.item"],
        campos: [sel("tipo", "Tipo", ["Checklist", "Compras"])],
      },
      {
        kind: "pessoal.item",
        nome: "Item",
        plural: "Itens",
        titulo: "Item",
        soFilho: true,
        marcavel: true,
        pai: { kinds: ["pessoal.lista", "pessoal.viagem"], obrigatorio: true },
        status: ["Pendente", "Feito"],
        finais: ["Feito"],
        resumo: ["quantidade"],
        campos: [t("quantidade", "Quantidade")],
      },
      {
        kind: "pessoal.viagem",
        nome: "Viagem",
        plural: "Viagens",
        titulo: "Destino",
        status: ["Planejando", "Reservada", "Realizada"],
        finais: ["Realizada"],
        data: "Ida",
        alerta: { dias: 14, frase: "Viagem" },
        resumo: ["volta", "orcamento"],
        filhos: ["pessoal.item"],
        campos: [data("volta", "Volta"), dinheiro("orcamento", "Orçamento"), longo("roteiro", "Roteiro e reservas")],
      },
      {
        kind: "pessoal.manutencao",
        nome: "Manutenção",
        plural: "Manutenção de veículos",
        titulo: "Serviço",
        status: ["Agendada", "Feita"],
        finais: ["Feita"],
        data: "Quando",
        alerta: { dias: 7, frase: "Manutenção", atraso: true },
        resumo: ["veiculo", "km", "custo"],
        campos: [t("veiculo", "Veículo"), num("km", "Quilometragem"), dinheiro("custo", "Custo"), longo("observacoes", "Observações")],
      },
      {
        kind: "pessoal.documento",
        nome: "Documento",
        plural: "Documentos",
        descricao: "Onde cada documento está e quando vence. Não guarde números de documentos aqui.",
        data: "Validade",
        alerta: { dias: 30, frase: "Documento vence", atraso: true },
        resumo: ["onde"],
        campos: [t("onde", "Onde está guardado"), url("link", "Link"), longo("observacoes", "Observações")],
      },
      {
        kind: "pessoal.objetivo",
        nome: "Objetivo",
        plural: "Objetivos",
        status: ["Em andamento", "Alcançado"],
        finais: ["Alcançado"],
        data: "Prazo",
        alerta: { dias: 7, frase: "Prazo de objetivo", atraso: true },
        campos: [longo("descricao", "Descrição")],
      },
    ],
  },
  {
    slug: "pesquisa",
    nome: "Pesquisa",
    descricao: "Pesquisas na internet feitas pelo agente, com fontes, links e datas, guardadas para consultar depois.",
    ambiente: "pessoal",
    entidades: [
      {
        kind: "pesquisa.pesquisa",
        nome: "Pesquisa",
        plural: "Pesquisas salvas",
        titulo: "Pergunta ou assunto",
        especial: "pesquisa",
        data: "Data da pesquisa",
        resumo: ["categoria"],
        campos: [
          sel("categoria", "Categoria", CATEGORIAS_PESQUISA),
          longo("resultado", "Resultado", "O que foi encontrado, separando o confirmado do não confirmado."),
          longo("fontes", "Fontes", "Uma por linha: título, link e data."),
        ],
      },
    ],
  },
];

export const ENTIDADES: Entidade[] = MODULOS.flatMap((m) => m.entidades);
export const KINDS = ENTIDADES.map((e) => e.kind);

export function moduloPorSlug(slug: string) {
  return MODULOS.find((m) => m.slug === slug);
}
export function entidade(kind: string) {
  return ENTIDADES.find((e) => e.kind === kind);
}
export function moduloDe(kind: string) {
  return MODULOS.find((m) => m.entidades.some((e) => e.kind === kind));
}
