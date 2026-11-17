# Especificação de Formulários para Aplicativo: APR e PT

Este documento contém a estrutura de dados e campos extraídos dos formulários físicos de **Análise Preliminar de Riscos (APR)** e **Permissão de Trabalho Integrada (PT)**, desconsiderando dados manuscritos e preenchimentos específicos, pronto para ser utilizado como base para modelagem de banco de dados e interfaces (UI/UX).

---

## Formulário 1: APR (Análise Preliminar de Riscos / Declaração de Métodos)

### 1. Cabeçalho e Identificação
*   **Unidade / Planta** (`Texto` / `Select`)
*   **Empresa Contratada** (`Texto` / `Select`)
*   **Data de Elaboração/Emissão da APR** (`Data`)
*   **Número da Revisão** (`Número`)
*   **Data da Revisão** (`Data`)
*   **Data Prevista de Início** (`Data`)
*   **Data Prevista de Término** (`Data`)
*   **Descrição dos Trabalhos** (`Texto longo`)
*   **Local da Atividade** (`Texto`)
*   **Responsável da Empresa** (`Texto`)
*   **Telefone do Responsável da Empresa** (`Telefone`)
*   **Responsável Segurança da Empresa** (`Texto`)
*   **Telefone do Responsável Segurança da Empresa** (`Telefone`)

### 2. Matriz de Análise de Riscos (Tabela Dinâmica / Lista Repetível)
*Para cada etapa da atividade, o usuário deve poder adicionar uma linha contendo:*
*   **Sequência de Atividades** (`Texto`)
*   **Técnicas / Ferramentas / Equipamentos Utilizados** (`Texto` / `Multi-select`)
*   **Descrição dos Riscos** (`Texto`)
*   **Possibilidade de SIF's (Precursor / Potencial / Real)** (`Select único`: Precursor, Potencial, Real, N/A)
*   **Medidas de Precauções e Controle** (`Texto longo` — *Regra de negócio: obrigatório preencher se houver risco*)
*   **Necessário Permissão de Trabalho (PT)?** (`Booleano`: Sim / Não)
*   **Fotos Ilustradas** (`Upload de Imagem`)

### 3. Bloco de Assinaturas e Aprovações (4 Perfis)
*Para cada um dos perfis abaixo: Responsável da Empresa, Responsável Segurança do Trabalho Empresa, Segurança do Trabalho Contratante (Ambev) e Responsável Contratante pela Atividade:*
*   **Nome** (`Texto`)
*   **Contato** (`Telefone`)
*   **Assinatura** (`Assinatura digital` / `Canvas`)

---

## Formulário 2: PT (Permissão de Trabalho Integrada)

### 1. Identificação Geral
*   **Número da PT** (`Numérico` / `Auto-incremento`)
*   **1 - Data** (`Data`)
*   **2 - Hora do Preenchimento** (`Hora`)
*   **3 - Solicitante** (`Texto`)
*   **4 - Empresa que Realizará a Atividade** (`Texto`)
*   **5 - Local da Atividade** (`Texto`)
*   **6 - Emitente** (`Texto`)
*   **7 - Descrição da Atividade** (`Texto longo`)

### 2. Classificação da Atividade (Gatilhos de Condicionalidade)
*   **8 - Tipo de Permissão de Trabalho** (`Checkboxes` / `Multi-select` — *Cada opção marcada deve destravar a seção correspondente no app*):
    *   [ ] Radiação Ionizante *(Habilita seções 11 e 17)*
    *   [ ] Substâncias Perigosas *(Habilita seções 11 e 17)*
    *   [ ] Atividade a Quente *(Habilita seções 11 e 12)*
    *   [ ] Trabalho em Altura *(Habilita seções 11 e 13)*
    *   [ ] Trabalho em Telhados *(Habilita seções 11 e 13)*
    *   [ ] Elevação / Movimentação de Cargas *(Habilita seções 11 e 14)*
    *   [ ] Espaço Confinado *(Habilita seção 11 + anexo PET)*
    *   [ ] Trabalhos Especiais *(Habilita seções 11 e 18)*
    *   [ ] Outra Atividade (`Booleano` + `Texto livre`)
*   **9 - Avaliação de Risco / Declaração de Método**:
    *   Existe APR para esta atividade? (`Booleano`: Sim [Anexar ID da APR] / Não [Travar emissão])

### 3. EPIs e Avaliação Obrigatória
*   **10 - EPI's Conforme Avaliação de Riscos** (`Checkboxes agrupados`):
    *   **Avental:** Raspa, Impermeável, PVC.
    *   **Calçado de Segurança:** Biqueira e Palmilha.
    *   **Capacete:** Normal, Alpinista.
    *   **Óculos:** Impacto, Hermético.
    *   **Protetor Auricular:** Concha, Plug.
    *   **Cinto de Segurança:** Talabarte Duplo Tipo Y, Trava Quedas.
    *   **Vestimenta:** Tyveck, Uniforme NR-10 (ATPV), Proteção Chuva, Proteção Térmica.
    *   **Protetor Facial:** Policarbonato, Tela.
    *   **Proteção Respiratória:** Máscara Semi Facial, Máscara Facial, Filtro PFF2, Filtro (`Texto livre`).
    *   **Luvas / Outros:** `Texto livre`.
*   **11 - Avaliação Obrigatória para Todas as Atividades** (`Checklist Sim / Não`):
    *   A equipe de execução se encontra no local?
    *   A equipe está habilitada para a atividade?
    *   A área está organizada para iniciar a atividade?
    *   Existe isolamento / controle de acesso no local?
    *   Existe acesso ao local de forma segura?
    *   As ferramentas estão disponíveis na frente de trabalho?
    *   A iluminação é adequada?
    *   As condições climáticas estão boas?
    *   Será necessário realizar algum bloqueio de energia? *(Se Sim, habilita seção 15)*
    *   A atividade está prevista no plano de emergência?

### 4. Checklists Específicos (Exibição Condicional)
*Todos os itens abaixo operam no padrão `Sim / Não / N/A`, exceto onde indicado:*

*   **12 - Trabalho a Quente:**
    *   APR contempla os riscos?
    *   APR deixa claro as ferramentas?
    *   Realizada em área classificada? *(Se Sim: Gases / Poeiras / Líquidos)*
    *   Local livre de combustíveis/inflamáveis (raio de 11m) ou protegidos?
    *   Será necessário retirar peça/equipamento?
    *   Será necessário acompanhamento após 5h do encerramento?
    *   Sistemas de proteção contra incêndio disponíveis? *(Extintor / Hidrante / Sprinkler / Outros)*
    *   Haverá proteção contra projeção de partículas? *(Isolamento / Lona anti-chama / Biombo)*
    *   Designado vigilância contra incêndio (pessoa treinada)?
    *   Nome do Brigadista/Bombeiro comunicado (`Texto`)

*   **13 - Trabalho em Altura e Telhados:**
    *   APR contempla os riscos?
    *   Pessoas envolvidas têm treinamento válido?
    *   Equipamentos contra queda em condições de uso?
    *   Condições climáticas adequadas?
    *   Atividade será realizada em telhado?
    *   Atividade em telhado foi validada pelo ZBS?
    *   Será necessário supervisão em tempo integral?
    *   Andaime tem placa de liberação?
    *   Foi realizado checklist? *(Escada / PEMT / Andaime / Cinto de Segurança / Linha de Vida)*
    *   Escada está ancorada?

*   **14 - Elevação / Movimentação de Cargas:**
    *   APR contempla os riscos?
    *   Envolve elevação acima de 10 toneladas?
    *   Envolve operação simultânea de 2 ou mais equipamentos?
    *   Existe Plano de Rigging disponível? *(Obrigatório se "Sim" nas anteriores)*
    *   Foi realizado checklist? *(Guindauto / Guindaste / Grua / Talha / Empilhadeira)*
    *   Necessário usar dispositivos? *(Balançim / Tartarugas de remoção / Pórtico)*
    *   Acessórios de ligação em boas condições (cintas, cabos, manilhas)?
    *   Área completamente isolada?
    *   Solo adequado para patolamento?
    *   Existe distância segura de redes energizadas?

*   **15 - Bloqueio de Energia (LOTOTO):**
    *   Necessário bloqueio de energia? (`Sim / Não`)
    *   Nº do Procedimento Padronizado (`Texto` — *Na ausência, exigir preenchimento do Anexo 1*)
    *   Nome da pessoa que realizou o bloqueio (`Texto`)

*   **16 - Escavação e Perfuração em Solos e Pisos:**
    *   APR contempla os riscos?
    *   Existe projeto ou plano de escavação?
    *   Realizada inspeção com georadar no local?
    *   Escavação possui acesso adequado?
    *   Profundidade > 1,25m possui escoramento previsto?
    *   Caracteriza espaço confinado? *(Se Sim, exigir emissão de PET)*

*   **17 - Substâncias Perigosas ou Químicas:**
    *   APR contempla os riscos?
    *   Envolve radiação ionizante? *(Seguir plano de radioproteção)*
    *   FDS do produto químico disponível na frente de serviço?
    *   Kit de mitigação ambiental disponível?
    *   EPCs necessários definidos e disponíveis (chuveiro, lava-olhos, etc.)?
    *   Equipamentos serão despressurizados, lavados, neutralizados ou inertizados?
    *   Necessário comunicar setor de Meio Ambiente antes do início?
    *   Nome da pessoa comunicada (`Texto`)

*   **18 - Trabalhos Especiais (Áreas Classificadas, Eletricidade, Amônia, Vapor, Vasos de Pressão):**
    *   APR contempla os riscos e medidas de controle?
    *   Realizado formulário de permissão para abertura de linha / entrada em equipamento?
    *   Atividade segue a matriz de aprovação estabelecida pelo ZBS?
    *   Nome da pessoa que preencheu o formulário (`Texto`)

### 5. Liberação, Revalidação, Executantes e Encerramento
*   **19 - Observações na Liberação** (`Texto longo`)
*   **20 - Assinaturas de Liberação** (3 perfis: *Emitente do Turno*, *Responsável pela Área*, *Responsável pela Atividade* — cada um com `Nome`, `Assinatura` e `Hora da Assinatura`).
*   **21 - Revalidação da Permissão de Trabalho:**
    *   Motivo da Revalidação (`Texto`)
    *   Assinaturas (*Emitente do Turno* e *Responsável pela Área* — `Nome`, `Assinatura`, `Hora`).
*   **22 - Encerramento da Atividade:**
    *   Permissão de Trabalho foi cancelada? (`Booleano` + `Motivo do cancelamento`)
    *   Necessário manter bloqueio de energia? (`Booleano` + `Nome do responsável pela continuidade`)
    *   Atividade finalizada por completo? (`Booleano` + `Horário do encerramento`)
    *   Necessário cuidado especial após término? (`Booleano` + `Nome da pessoa designada`)
    *   A área está limpa e organizada? (`Booleano`)
    *   Nome da pessoa comunicada sobre descarte (`Texto`)
*   **Executantes (Tabela Dinâmica / Lista Repetível):**
    *   Nome (`Texto`)
    *   Função (`Texto`)
    *   Empresa (`Texto`)
    *   Assinatura Trabalho Geral (`Assinatura`)
    *   Assinatura Trabalho a Quente (`Assinatura`)
    *   Assinatura Trabalho em Altura (`Assinatura`)
*   **23 - Assinatura de Encerramento:** Mesma estrutura do item 20 (*Emitente do Turno*, *Responsável pela Área*, *Responsável pela Atividade*).

---

## Apontamento Técnico para o Desenvolvimento do App

No documento físico da PT (seção 8), o formulário exige que o usuário marque o tipo de risco e depois lembre de preencher os quadros correspondentes (ex: *"Preencher campo 11 e 13"*). 

Para a arquitetura do aplicativo, recomenda-se implementar as seguintes regras de negócio e UX:

1.  **Renderização Condicional:** Não deixe a navegação entre seções manual. Exiba em tela apenas os blocos de checklist (seções 12 a 18) correspondentes aos checkboxes marcados na **Seção 8** (e o item de bloqueio de energia da **Seção 11**).
2.  **Travas de Segurança (Validation Gates):**
    *   **Vínculo Obrigatório com APR:** Impeça a emissão ou avanço da PT caso a opção *"Não"* seja selecionada na **Seção 9** (ou caso não haja um ID de APR válida vinculada).
    *   **Bloqueio de Assinaturas:** Desabilite o botão de coleta de assinaturas de liberação (**Seção 20**) caso exista qualquer item obrigatório nos checklists marcados como *"Não"* sem uma justificativa/plano de ação registrado, garantindo conformidade legal e operacional antes do início da tarefa.
3.  **Reaproveitamento de Dados:** Ao vincular uma APR existente na PT, o aplicativo pode pré-preencher automaticamente campos como *Local da Atividade*, *Empresa Contratada*, *Descrição* e sugerir os *EPIs* já mapeados na APR.