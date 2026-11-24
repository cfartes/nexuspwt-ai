export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'date' | 'time' | 'answer' | 'choice';
  options?: string[];
};
export type Section = { id: string; title: string; fields: Field[] };
const checks = (labels: string[]): Field[] =>
  labels.map((label, i) => ({ key: `q${i + 1}`, label, type: 'answer' }));
export const permissionTypes = [
  'Radiação ionizante',
  'Substâncias perigosas',
  'Trabalho a quente',
  'Trabalho em altura',
  'Trabalho em telhados',
  'Movimentação de cargas',
  'Espaço confinado',
  'Trabalhos especiais',
  'Escavação e perfuração',
  'Outra atividade',
];
export const aprProfiles = [
  'Responsável da empresa',
  'Segurança do trabalho da empresa',
  'Segurança do trabalho contratante',
  'Responsável contratante pela atividade',
];
export const ptProfiles = [
  'Emitente do turno',
  'Responsável pela área',
  'Responsável pela atividade',
];
export const ppeOptions = [
  'Avental de raspa',
  'Avental impermeável',
  'Avental PVC',
  'Calçado com biqueira e palmilha',
  'Capacete normal',
  'Capacete alpinista',
  'Óculos de impacto',
  'Óculos hermético',
  'Protetor concha',
  'Protetor plug',
  'Talabarte duplo Y',
  'Trava-quedas',
  'Tyvek',
  'Uniforme NR-10 (ATPV)',
  'Proteção de chuva',
  'Proteção térmica',
  'Protetor facial policarbonato',
  'Protetor facial tela',
  'Máscara semifacial',
  'Máscara facial',
  'Filtro PFF2',
];
export const ptSections: Section[] = [
  {
    id: 'general',
    title: 'Identificação e EPI',
    fields: [
      { key: 'date', label: 'Data', type: 'date' },
      { key: 'time', label: 'Hora do preenchimento', type: 'time' },
      { key: 'endsAt', label: 'Horário previsto de término', type: 'time' },
      { key: 'requester', label: 'Solicitante' },
      { key: 'issuer', label: 'Emitente' },
      { key: 'otherActivity', label: 'Outra atividade: especificar' },
      { key: 'otherPpe', label: 'Luvas, filtros e outros EPIs', type: 'textarea' },
    ],
  },
  {
    id: 's11',
    title: '11 · Avaliação obrigatória',
    fields: checks([
      'Equipe de execução no local?',
      'Equipe habilitada para a atividade?',
      'Área organizada para iniciar a atividade?',
      'Isolamento e controle de acesso disponíveis?',
      'Acesso seguro ao local?',
      'Ferramentas disponíveis na frente de trabalho?',
      'Iluminação adequada?',
      'Condições climáticas adequadas?',
      'Necessário bloqueio de energia?',
      'Atividade prevista no plano de emergência?',
    ]),
  },
  {
    id: 's12',
    title: '12 · Trabalho a quente',
    fields: [
      ...checks([
        'APR contempla os riscos?',
        'APR identifica as ferramentas?',
        'Atividade em área classificada?',
        'Local livre de combustíveis/inflamáveis no raio de 11 m ou protegidos?',
        'Necessário retirar peça/equipamento?',
        'Necessário acompanhamento após 5 h do encerramento?',
        'Sistemas de proteção contra incêndio disponíveis?',
        'Proteção contra projeção de partículas disponível?',
        'Vigilância contra incêndio designada e treinada?',
      ]),
      { key: 'classification', label: 'Área classificada: gases, poeiras ou líquidos' },
      { key: 'fireSystems', label: 'Extintor, hidrante, sprinkler e outros' },
      { key: 'particleProtection', label: 'Isolamento, lona antichama ou biombo' },
      { key: 'firefighter', label: 'Brigadista/bombeiro comunicado' },
    ],
  },
  {
    id: 's13',
    title: '13 · Altura e telhados',
    fields: [
      ...checks([
        'APR contempla os riscos?',
        'Treinamento dos envolvidos válido?',
        'Equipamentos contra queda em condições de uso?',
        'Condições climáticas adequadas?',
        'Atividade em telhado?',
        'Atividade em telhado validada pelo ZBS?',
        'Necessária supervisão em tempo integral?',
        'Andaime com placa de liberação?',
        'Checklist realizado?',
        'Escada ancorada?',
      ]),
      { key: 'equipment', label: 'Checklist: escada, PEMT, andaime, cinto e linha de vida' },
    ],
  },
  {
    id: 's14',
    title: '14 · Elevação e movimentação de cargas',
    fields: [
      ...checks([
        'APR contempla os riscos?',
        'Elevação acima de 10 toneladas?',
        'Operação simultânea de dois ou mais equipamentos?',
        'Plano de Rigging disponível?',
        'Checklist dos equipamentos realizado?',
        'Necessário utilizar dispositivos?',
        'Acessórios de ligação em boas condições?',
        'Área completamente isolada?',
        'Solo adequado para patolamento?',
        'Distância segura de redes energizadas?',
      ]),
      { key: 'equipment', label: 'Guindauto, guindaste, grua, talha ou empilhadeira' },
      { key: 'devices', label: 'Balancim, tartarugas ou pórtico' },
    ],
  },
  {
    id: 's15',
    title: '15 · Bloqueio de energia / LOTOTO',
    fields: [
      ...checks(['Necessário bloqueio de energia?']),
      { key: 'procedure', label: 'Número do procedimento padronizado' },
      { key: 'operator', label: 'Pessoa que realizou o bloqueio' },
      { key: 'annex', label: 'Referência do Anexo 1 (anexo digital ainda pendente)' },
    ],
  },
  {
    id: 's16',
    title: '16 · Escavação e perfuração',
    fields: checks([
      'APR contempla os riscos?',
      'Projeto ou plano de escavação disponível?',
      'Inspeção com georadar realizada?',
      'Escavação com acesso adequado?',
      'Escoramento previsto para profundidade superior a 1,25 m?',
      'Caracteriza espaço confinado e exige PET?',
    ]),
  },
  {
    id: 's17',
    title: '17 · Substâncias perigosas e químicas',
    fields: [
      ...checks([
        'APR contempla os riscos?',
        'Envolve radiação ionizante e segue plano de radioproteção?',
        'FDS disponível na frente de serviço?',
        'Kit de mitigação ambiental disponível?',
        'EPCs necessários definidos e disponíveis?',
        'Equipamentos serão despressurizados, lavados, neutralizados ou inertizados?',
        'Necessário comunicar Meio Ambiente antes do início?',
      ]),
      { key: 'contact', label: 'Pessoa comunicada' },
    ],
  },
  {
    id: 's18',
    title: '18 · Trabalhos especiais',
    fields: [
      ...checks([
        'APR contempla riscos e medidas de controle?',
        'Formulário para abertura de linha/entrada em equipamento preenchido?',
        'Atividade segue a matriz de aprovação ZBS?',
      ]),
      { key: 'author', label: 'Pessoa que preencheu o formulário' },
    ],
  },
  {
    id: 's19',
    title: '19 · Observações na liberação',
    fields: [{ key: 'notes', label: 'Observações', type: 'textarea' }],
  },
  {
    id: 's21',
    title: '21 · Revalidação',
    fields: [{ key: 'reason', label: 'Motivo da revalidação', type: 'textarea' }],
  },
  {
    id: 's22',
    title: '22 · Encerramento',
    fields: [
      ...checks([
        'PT cancelada?',
        'Necessário manter bloqueio de energia?',
        'Atividade finalizada por completo?',
        'Necessário cuidado especial após o término?',
        'Área limpa e organizada?',
      ]),
      { key: 'cancelReason', label: 'Motivo do cancelamento' },
      { key: 'lockOwner', label: 'Responsável pela continuidade do bloqueio' },
      { key: 'finishedAt', label: 'Horário do encerramento', type: 'time' },
      { key: 'careOwner', label: 'Pessoa designada para cuidado especial' },
      { key: 'disposalContact', label: 'Pessoa comunicada sobre descarte' },
    ],
  },
];
export function visibleSections(types: string[], answers: Record<string, string>) {
  const ids = new Set(['general', 's11', 's19', 's21', 's22']);
  if (types.includes('Trabalho a quente')) ids.add('s12');
  if (types.some((t) => ['Trabalho em altura', 'Trabalho em telhados'].includes(t))) ids.add('s13');
  if (types.includes('Movimentação de cargas')) ids.add('s14');
  if (answers['s11.q9'] === 'Sim') ids.add('s15');
  if (types.includes('Escavação e perfuração')) ids.add('s16');
  if (types.some((t) => ['Radiação ionizante', 'Substâncias perigosas'].includes(t)))
    ids.add('s17');
  if (types.includes('Trabalhos especiais')) ids.add('s18');
  return ptSections.filter((s) => ids.has(s.id));
}
