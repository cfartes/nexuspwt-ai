# Nexus PTW AI

Primeira base executável do MVP de gestão de APR e PT para Ambev e suas unidades.
Aplicação local, destinada às VPS do projeto. Nenhum serviço foi publicado e nenhum documento autoriza execução nesta fase.

## Implementado

- Next.js, React e TypeScript, interface responsiva em português.
- Login individual, senha com scrypt, sessão em cookie HttpOnly, limite de tentativas e validação de origem nas alterações.
- PostgreSQL com SQL parametrizado e migração inicial. Foi usado `pg` diretamente nesta primeira versão para evitar adicionar um ORM além do SQL necessário.
- Empresa, regional, unidade, usuários por unidade, terceirizadas e autorização por unidade. Reutilize o mesmo CNPJ da terceirizada em outra unidade da empresa para criar o vínculo.
- Gestão em **Pessoas e acessos**: telefone, perfil, terceirizada, ativação e desativação por unidade, com controle de versão e histórico. Mudanças não alteram o telefone global nem o acesso das outras unidades; a unidade não pode ficar sem administrador ativo.
- Aprovadores locais e regionais; atribuição local tem precedência sobre regional para o mesmo perfil.
- APR por serviço, etapas e riscos, controles obrigatórios, executantes e várias PTs vinculadas.
- Checklists condicionais da PT e campos dos formulários descritos no Markdown original.
- Rascunhos locais em IndexedDB, fila de envio ao reconectar/reabrir o app e detecção de conflitos por versão.
- Captura pela câmera com legenda, geolocalização, precisão, data/hora do dispositivo, recebimento no servidor e hash SHA-256. Exige HTTPS ou localhost e permissões de câmera/localização.
- Fotos privadas no PostgreSQL nesta etapa do piloto. `shortcut: fotos no banco aumentam o backup, migrar para armazenamento de objetos antes de ampliar o volume.`
- Aprovação interna da APR em paralelo, vinculada ao snapshot da revisão, com histórico de autoria e decisões. Um usuário com mais de um perfil aprova todos os seus perfis pendentes ao decidir.
- Nova revisão de APR aprovada, com motivo obrigatório, autoria e nova análise. A versão anterior permanece arquivada e cada PT mantém a versão original da APR, incluindo período e terceirizada.
- Consulta do histórico de atividades e impressão de versões arquivadas. Novas PTs exigem uma APR atualmente aprovada; revisar a APR não revalida nem cancela automaticamente PTs existentes.
- Prévia de impressão com campos, etapas, decisões e anexo de evidências. Usa impressão do navegador para PDF.
- Docker Compose do app e tela de configuração de assinatura eletrônica (DocuSign ou Certisign) e OpenWA por empresa.
- Fila transacional de avisos de aprovação pelo OpenWA: um aviso por destinatário e versão, processo de envio separado e painel de acompanhamento em Aprovações. Links exigem login e abrem a unidade/documento corretos; links antigos não abrem automaticamente uma revisão diferente para decisão.

## Executar com PostgreSQL

Requer Node.js 24 e PostgreSQL 17. O Docker instalado nesta estação estava sem o daemon iniciado; os testes usaram PostgreSQL embarcado (PGlite), apenas em desenvolvimento.

1. Execute `npm ci`.
2. Copie `.env.example` para `.env.local`.
3. Informe `DATABASE_URL`, `BOOTSTRAP_EMAIL`, uma `BOOTSTRAP_PASSWORD` de pelo menos 12 caracteres e o nome da unidade em `BOOTSTRAP_UNIT`.
4. Execute `npm run db:setup`. Cria o schema, Ambev, unidade piloto e administrador se ainda não existir administrador da plataforma. Não redefine senhas existentes.
5. Execute `npm run dev` e acesse <http://localhost:3000>.
6. Após criar o primeiro acesso, remova a senha de bootstrap do arquivo de ambiente.

Não há senha padrão, conta pública ou demonstração com dados simulados no aplicativo.

Os cadastros possuem menus próprios: **Empresas**, **Regionais**, **Unidades**, **Terceirizadas**, **Pessoas e acessos** e **Aprovadores**, com listagem e botão **Novo cadastro**. Empresas é exclusivo do superadmin. Administradores consultam as unidades e regionais da empresa ativa; terceirizadas, usuários e aprovadores seguem o contexto da unidade. As listas de empresas, regionais, unidades e terceirizadas possuem busca e contagem. Em Pessoas, o formulário permite criar usuário ou vincular uma conta existente. Para aproveitar aprovador regional, crie uma regional e uma unidade nessa regional, dê acesso ao aprovador e atribua o perfil regional. Integrações permanecem em Configurações. Convites de primeiro acesso estão disponíveis para novos aprovadores; recuperação de senha de contas ativas ainda não está implementada.

## Convite de primeiro acesso para aprovadores

Ao criar um usuário com perfil **Aprovador**, não há campo de senha inicial. A mesma transação cria a conta pendente, o vínculo com a unidade e duas entregas de convite: e-mail e WhatsApp. Os demais perfis continuam com senha inicial administrada. Contas já existentes mantêm suas senhas; isso não é recuperação de senha para contas ativas.

Em **Configurações → Envio de e-mail · Resend**, somente o superadmin define a API Key e o e-mail remetente verificado no Resend. A chave é cifrada com `INTEGRATIONS_ENCRYPTION_KEY` e não volta ao navegador; campo vazio preserva a chave anterior. O envio usa a [API oficial do Resend](https://resend.com/docs/api-reference/emails/send-email) e uma chave de idempotência por entrega. O administrador da unidade pode criar e reenviar convites, mas não acessar essa credencial.

Execute `npm run db:setup` antes de iniciar a versão com a migração `008-user-invitations.sql`. Configure `APP_URL` com a origem HTTPS pública do app e mantenha o WhatsApp Business pareado com o número correto da empresa. Convites ficam bloqueados em `localhost`, pois os destinatários externos não conseguiriam abrir esse endereço. Os convites de WhatsApp independem da opção de avisos de aprovação: são mensagens de primeiro acesso solicitadas no cadastro. O telefone deve incluir DDI e DDD.

O processo `npm run notifications:work` (ou o serviço `notifications` do Compose) processa os dois canais e a fila de aprovação, usando a mesma trava e intervalo mínimo de cinco segundos. Em **Pessoas e acessos**, a coluna de convite mostra a situação por canal e eventuais bloqueios; atualize a tela para acompanhar. **Reenviar convite** gera um novo link, invalida os anteriores e agenda os dois canais novamente. Bloqueios de configuração são reavaliados a cada minuto; resultados incertos não são repetidos automaticamente. Confira o provedor antes de gerar outro convite, pois uma mensagem anterior pode ter sido aceita. “Aceito pelo provedor” não comprova entrega ou leitura.

O link abre `/definir-senha`, tem validade de 24 horas e só funciona uma vez. O token é aleatório; a validação usa seu hash. A cópia necessária à entrega fica cifrada e é apagada ao consumir, substituir ou após expirar quando o processo de envio executa. O token não é devolvido nas APIs de cadastro/listagem nem registrado no histórico. Ele viaja no fragmento da URL, removido ao abrir a página, sem ser enviado no GET ou no referer. Abrir o link não consome o convite; é preciso definir uma senha de pelo menos 12 caracteres. Consumo, troca da senha e encerramento das sessões da conta são atômicos. A conta não pode entrar antes de definir a senha; convites expirados, substituídos ou sem acesso ativo à unidade são recusados. O superadmin continua sendo criado pelo bootstrap, sem senha padrão no código.

## Validação

### Limite comercial de unidades por empresa

Em **Configurações → Limite de unidades**, o superadmin que administra a unidade selecionada define a quantidade máxima de unidades da empresa. A unidade inicial ocupa uma vaga. Novas empresas começam com uma vaga; a migração `010-company-unit-limit.sql` preserva empresas existentes, liberando inicialmente pelo menos o número de unidades já cadastradas. Reexecutar as migrações não modifica limites configurados.

Em **Unidades**, administradores veem o total usado/permitido e o botão de cadastro fica bloqueado ao atingir o limite. O servidor aplica a mesma regra, inclusive para o superadmin, serializando o cadastro e a alteração do limite por empresa. Não é permitido reduzir o limite abaixo do total cadastrado. Excluir uma unidade permitida libera sua vaga, sem alterar o limite contratado. Usuários, terceiros, APRs e PTs não consomem vagas. A alteração fica na auditoria e possui controle de versão. Este recurso controla licenças de unidades; não calcula mensalidades nem emite cobranças, que continuam fora do app.

**Remover APR** aparece nas listagens para administradores da unidade. A operação exige a versão atual e não permite nenhuma PT vinculada, inclusive rascunhos e PTs que apontam para revisões anteriores. A APR sai da operação, mas permanece arquivada com autoria, decisões, versões e auditoria. Não pode ser editada, aprovada ou usada em novas PTs. Avisos ainda pendentes são cancelados; uma chamada já enviada ao gateway pode terminar. Impressões históricas recebem o aviso de APR removida. A migração `009-apr-removal.sql` é aplicada por `npm run db:setup`. A autorização exige administrador da própria unidade; ser superadmin sem esse perfil na unidade não basta.

Os testes rodam com até dois arquivos simultâneos para limitar os bancos PGlite em memória durante a execução da suíte.

### Exclusão de cadastros

Em Pessoas, **Remover acesso desta unidade** preserva a conta nas demais unidades e ela pode aparecer entre usuários disponíveis para vinculação. O superadmin também possui **Excluir usuário da plataforma**, inclusive nessa lista de usuários disponíveis. Esse comando retira a conta das listagens e da vinculação em todas as unidades, impede login, encerra sessões e invalida convites. A identificação permanece inativa para preservar documentos e auditoria; seu e-mail continua reservado. Aprovações pendentes, atribuições ativas ou uma unidade sem outro administrador impedem a exclusão global. Não é possível excluir a própria conta, e contas excluídas não podem receber novos vínculos.

Empresas, Regionais, Unidades, Terceirizadas, Pessoas e Aprovadores possuem **Excluir**, com confirmação em popup, validação de permissão no servidor e auditoria. Empresas e atribuições regionais são exclusivas do superadmin. Cadastros com dependências ou histórico protegido retornam um motivo; não há exclusão em cascata de documentos, decisões ou fotos. Alterações concorrentes de contratadas, acessos e atribuições são detectadas pela versão.

Em Pessoas, a operação remove o acesso da unidade selecionada e invalida seus convites pendentes. Outras unidades e a conta compartilhada permanecem. Sem outros vínculos, a conta só é apagada quando não possui referências históricas; caso contrário, use **Editar acesso → desativar**. Não é possível excluir o próprio acesso, remover o último administrador ativo ou excluir o acesso de um aprovador com pendências/atribuições ativas sem ajustá-las antes. Somente superadmin pode excluir acesso de outra conta da plataforma.

Em Terceirizadas, remove-se a autorização da unidade. Usuários vinculados ou APR/PT e snapshots históricos desta unidade impedem a operação. O cadastro global só é apagado quando não restam vínculos nem uso histórico; outras unidades mantêm seus dados. Em Aprovadores, excluir remove apenas a configuração para novas submissões; aprovações já registradas e acessos existentes são preservados. Unidades só são removidas sem documentos, convites, contratadas, atribuições ou outros usuários vinculados, removendo o acesso do administrador que executa a operação. A unidade ativa só pode ser excluída se houver outra unidade acessível para continuar a sessão. Empresas com unidades, regionais, contratadas ou sessão de WhatsApp vinculada não podem ser excluídas.

Cadastros novos e edição de usuários, aprovadores e contratadas usam popup com foco contido, fechamento por Escape e erros dentro do formulário. Avisos gerais são limpos ao mudar de menu. Em Pessoas, o administrador também vê contas da mesma empresa sem vínculo com a unidade atual e pode vinculá-las explicitamente, escolhendo o perfil e a terceirizada; isso não altera a senha nem os acessos das outras unidades.

Contratadas possuem razão social, CNPJ, nome fantasia, contato responsável, telefone, e-mail e endereço completo. A edição de dados é compartilhada entre as unidades da empresa que usam o mesmo CNPJ, com controle de versão. Cadastrar um CNPJ existente apenas autoriza o vínculo, sem sobrescrever os dados. A migração `007-contractor-details.sql` preserva registros antigos e permite completar os campos opcionais. A busca automática usa [ViaCEP](https://viacep.com.br/), ao informar oito dígitos, sem enviar dados da contratada ao serviço. Preenche logradouro, bairro, cidade e UF; número e complemento são manuais. Falhas permitem preenchimento manual e respostas antigas não sobrescrevem um CEP novo nem alterações manuais feitas durante a consulta.

Nas listagens de cadastros, o admin local consulta somente unidades com acesso ativo; o superadmin pode consultar todas as unidades da empresa selecionada. A lista geral de empresas é exclusiva do superadmin. Consultar um cadastro não concede acesso operacional a outras unidades.

```powershell
npm test
npm run typecheck
npm run build
npm run test:integration
```

O teste de integração abre temporariamente um PostgreSQL embarcado na porta local 55439 e o app na porta 3109, cria credenciais aleatórias somente na memória e encerra os dois ao finalizar. O teste do processo de notificações usa a porta local 55440 e respostas simuladas do OpenWA; também inicia o script real com envios desativados para conferir a execução. Não utiliza a VPS, dados reais nem envia mensagens a provedores reais.

## Subir o app na VPS

1. Copie `deploy/.env.example` para `deploy/.env` e substitua os valores. A senha do banco na URL precisa estar codificada para URL; usar caracteres alfanuméricos aleatórios simplifica isso.
2. Configure `APP_URL` com a origem HTTPS exata do app. O proxy deve encaminhar para `127.0.0.1:3010` preservando o domínio público.
3. Na pasta `deploy`, execute `docker compose up -d --build`.
4. Rode a configuração inicial pelo container, informando as variáveis de bootstrap no ambiente do terminal:

```bash
docker compose exec -e BOOTSTRAP_EMAIL -e BOOTSTRAP_PASSWORD -e BOOTSTRAP_UNIT app node scripts/setup.mjs
```

O banco fica somente na rede Docker. A aplicação escuta na interface local da VPS, atrás do proxy HTTPS. Não executamos estes passos remotamente.

## Decisões e limitações desta entrega

- A validade da APR acompanha as datas previstas. A PT fica dentro desse intervalo; vencimento por turno e revalidação operacional aguardam o contratante.
- O conteúdo da APR aprovada fica imutável no arquivo histórico. O autor ou gestor pode usar **Criar revisão**, informando um motivo, para abrir um novo rascunho do mesmo serviço. O contador representa versões salvas e pode saltar entre aprovações; numeração editorial separada ainda não foi definida com o contratante. Rascunhos intermediários não enviados para análise têm eventos registrados, mas não cópias integrais arquivadas.
- O fluxo de aprovação interna é provisoriamente paralelo. Sequência, substitutos, proibição de autoaprovação e critérios de liberação dependem de confirmação.
- A liberação da PT está bloqueada no servidor. Não basta preencher checklists para autorizar trabalho. Não há aprovação offline.
- N/A aparece nos checklists do protótipo; os itens que podem aceitá-lo devem ser homologados.
- Escavação aparece como tipo proposto para alcançar a seção 16; o contratante ainda precisa confirmar esse gatilho.
- PET, Anexo 1 de LOTOTO e anexos documentais adicionais não estão implementados. Fotos ilustrativas em cada etapa da APR também estão pendentes; a captura atual é para conclusão da PT.
- Assinaturas de executantes, liberação, revalidação e encerramento não são coletadas nesta versão. Aprovação interna não é assinatura eletrônica.
- Assinatura eletrônica: a tela permite selecionar DocuSign ou Certisign e salvar a configuração por empresa. DocuSign usa dados da aplicação OAuth; Certisign usa token de integração. Autorização OAuth, envio de PDFs, coleta de assinaturas e webhooks ainda não estão implementados.
- OpenWA: configuração por empresa com URL, chave completa e UUID da sessão. O teste de conexão consulta apenas o status da sessão. Há envio de avisos por processo separado, desativado por padrão; o contrato foi implementado e testado com respostas simuladas. A chave recebida estava abreviada e o UUID ausente; não houve conexão real nem envio real de mensagens.
- Impressão: modelo estruturado inicial, não homologado como reprodução fiel. Ainda faltam modelos originais em branco, papel, folhas de continuação e validação visual com o cliente. Upload e reconstrução automática de modelos não foram implementados.
- Offline: primeiro login e download do workspace exigem internet. O acesso offline se limita à sessão previamente autenticada na mesma aba. A sincronização requer app aberto/reaberto; não há promessa de envio com app fechado. Fechar sem salvar perde as alterações do formulário.
- Dados locais são separados por usuário e removidos no logout; logout é bloqueado quando há fila pendente. Limpar dados do navegador ou perder o aparelho pode eliminar itens ainda não sincronizados. Dispositivo compartilhado precisa de proteção local antes do uso operacional.
- Acesso executante lista apenas documentos próprios, PTs em que está vinculado e APRs aprovadas da unidade. Quando o acesso está vinculado a uma terceirizada, todas essas consultas e operações ficam limitadas a ela, inclusive fotos, histórico, impressão e avisos. Equipe própria (`contractor_id` nulo) mantém o alcance do seu perfil na unidade. Cadastros antigos sem vínculo são preservados como equipe própria; revise a classificação antes de incluir usuários reais de terceiros.
- O isolamento usa permissões no servidor e chaves compostas entre empresa/unidade/terceirizada; políticas RLS no PostgreSQL ainda não foram implementadas. Homologação de segurança é necessária antes de expor dados reais de múltiplos clientes.
- Guarda de cinco anos é requisito registrado, não uma política de backup já executada. Antes do uso real, definir o marco inicial da retenção, configurar backups externos de banco e certificado e testar restauração. Não existe exclusão automática.
- IA, cobrança do SaaS e integração com cloud do cliente ficam fora desta primeira etapa.
- Não houve teste com celular físico ou implantação Linux. A implantação Docker foi validada estruturalmente, sem construir containers nesta estação.

## Configurar integrações

1. Atualize o banco com `npm run db:setup` (ou `docker compose exec app node scripts/setup.mjs`). As migrações numeradas são aditivas e não removem documentos; `006-whatsapp-gateway.sql` cria a configuração global do OpenWA.
2. Gere `INTEGRATIONS_ENCRYPTION_KEY` com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e configure no ambiente do servidor. São 64 caracteres hexadecimais. Faça backup seguro dessa chave; substituí-la sem recriptografar as credenciais impede sua leitura.
3. Configure `OPENWA_ALLOWED_ORIGINS` com a origem HTTPS do gateway autorizado e `OPENWA_DEFAULT_URL` com sua URL raiz ou base `/api`. O valor do guia recebido deve ser configurado no ambiente privado; o guia com senhas do painel não é copiado para o projeto.
4. Acesse **Configurações**. A configuração de assinatura pertence à empresa e continua exclusiva do administrador da plataforma. No WhatsApp, a URL e a chave global são exclusivas do superadmin; administradores de unidade podem parear o número da sua empresa.
5. Em assinatura, escolha DocuSign ou Certisign, ambiente e identificadores. Informe Client Secret para DocuSign ou token de integração para Certisign. A troca de fornecedor remove a credencial anterior. A seleção ainda não ativa o fluxo de assinatura.
6. Como superadmin, expanda **Gateway OpenWA · somente superadmin**, informe a URL e a chave `X-API-Key` completa e salve. Campo vazio mantém a chave anterior. A origem HTTPS precisa estar autorizada no servidor. A rotação atualiza as credenciais cifradas das empresas; trocar para outro gateway com sessões vinculadas exige migração assistida.
7. Como administrador, informe somente o telefone do WhatsApp Business com DDI e DDD e clique em **Conectar WhatsApp**. O app cria ou recupera uma sessão com nome exclusivo `nexus-ptw-{empresa}` e inicia o pareamento. No telefone, abra **Aparelhos conectados → Conectar um aparelho** e leia o QR Code. Enquanto a tela está aberta, o app consulta a conexão a cada cinco segundos até confirmar o número. Em caso de falha, use **Atualizar conexão** ou **Conectar WhatsApp**.
8. O vínculo só aparece como conectado quando o número retornado pelo gateway corresponde ao informado. Número diferente ou identidade ausente mantêm os avisos desativados. Sessões/números vinculados a outra empresa são recusados. O admin não recebe URL, chave ou UUID. Pareamento não envia mensagens; habilite os avisos separadamente após conectar. Sessões legadas são preservadas e exigem confirmação do telefone.

Se a sessão for removida diretamente no gateway, **Atualizar conexão** indica que ela não existe mais e **Conectar WhatsApp** recupera ou cria somente a sessão com nome exclusivo desta empresa no PTW, sem aproveitar sessões do RotaFY. Status e QR retornados pelo comando de início são tratados imediatamente. Ausência da identidade do aparelho fica como **Aguardando confirmação do número**, sem afirmar que é um número diferente. Erros de consulta limpam o QR e a indicação de conexão na tela. Números brasileiros com 10/11 dígitos e sem `+` recebem o DDI 55; números internacionais devem incluir `+` e o código do país.

Credenciais são criptografadas com AES-256-GCM e vinculadas ao contexto da plataforma ou empresa e serviço. O backend retorna apenas a existência da chave, nunca seu conteúdo; a tela não envia credenciais à fila offline. Eventos de configuração não contêm credenciais. Alterações usam controle de versão para evitar sobrescrita concorrente. O QR é aceito somente como PNG em base64 e não é persistido no banco. O provisionamento usa o contrato do Nexus RotaFY (`/sessions`, `/start`, `/qr`), com sessões próprias deste app. Ainda não há webhooks de conexão.

Documentação oficial: [DocuSign OAuth](https://developers.docusign.com/platform/auth/), [Certisign: autenticação por token](https://desenvolvedor.certisign.io/docs/guias/assinaturas/autenticacao-autorizacao/). Ainda precisamos mapear campos e signatários por versão, implementar os fluxos de autenticação/envio/eventos e arquivar os PDFs finais. O envio de WhatsApp só é executado quando a empresa o habilita e o processo abaixo está ativo.

## Ativar avisos pelo WhatsApp

1. Atualize o banco antes de iniciar o processo de envio.
2. Configure o gateway como superadmin e faça o pareamento pelo telefone e QR Code conforme a seção anterior. Os aprovadores precisam de telefone internacional com DDI e DDD no cadastro. O processo de envio também confere o número conectado antes de enviar.
3. Marque **Habilitar avisos de aprovação pelo WhatsApp** em Configurações. Essa opção começa desmarcada; uma atualização de configuração que não informe a opção mantém o envio desativado por segurança.
4. Em desenvolvimento, execute `npm run notifications:work` em um terminal separado. Em produção, na pasta `deploy`, execute `docker compose --profile notifications up -d --build notifications`. O serviço é opcional e não inicia no `docker compose up` padrão.
5. Use **Aprovações → Avisos de aprovação** para consultar a fila. Administradores e gestores veem a unidade; os demais usuários veem somente seus próprios avisos. Atualize a lista para acompanhar o processamento.

O envio usa `POST /api/sessions/{id}/messages/send-text`, após conferir a sessão. A mensagem contém somente tipo/número/versão do documento e link para o Nexus; não contém descrição dos riscos nem credenciais. O registro da fila ocorre na mesma transação da submissão para análise. Vários perfis atribuídos ao mesmo usuário geram um único aviso. O processo revalida versão, pendência, usuário ativo e acesso antes de enviar e cancela avisos obsoletos.

O processo trata um aviso a cada cinco segundos e usa uma trava global no PostgreSQL para impedir processamento simultâneo entre instâncias. Configuração ausente, telefone inválido ou sessão desconectada deixam o aviso bloqueado, com nova avaliação após um minuto. Ajustar a configuração libera avisos bloqueados para reavaliação. Habilitar a empresa pode enviar avisos antigos que ainda estiverem pendentes; documentos já decididos são descartados pelo processo.

Timeout, resposta sem confirmação ou interrupção durante envio deixam o resultado **incerto**, sem repetição automática. Isso evita duplicar mensagens quando o gateway pode ter aceitado a primeira tentativa. Administrador/gestor pode solicitar nova tentativa, confirmando o risco de duplicidade após conferir o painel do OpenWA. Essa ação fica no histórico do documento. Avisos aceitos pelo gateway não são reenviados automaticamente; não há confirmação de entrega ou leitura, pois os webhooks ainda não foram integrados.

Nenhuma aprovação é executada pelo link ou pela mensagem. O usuário precisa entrar no app e registrar sua decisão. Desabilitar o envio afeta as próximas preparações; uma requisição já em andamento pode terminar. Mensagens ao solicitante após a decisão, lembretes periódicos, grupos e anexos não fazem parte desta etapa.

## Gerenciar pessoas por unidade

No cadastro de usuário ou vínculo de uma conta existente, escolha **Equipe própria da contratante** ou uma terceirizada autorizada. Em **Pessoas e acessos → Editar acesso**, o administrador da unidade pode corrigir o telefone, mudar o perfil/vínculo ou desativar o acesso. O e-mail de login, nome global, senha e a conta não são modificados por essa tela. Um usuário pode manter acessos e contatos diferentes em outras unidades. Telefone vazio na edição suspende avisos de WhatsApp naquela unidade, sem voltar silenciosamente ao número global.

Administrador da unidade precisa pertencer à equipe própria. Aprovador regional também permanece na equipe própria; para alterar esse vínculo, é preciso desativar ou substituir sua atribuição regional antes. A desativação do próprio acesso deve ser feita por outro administrador; o último administrador ativo não pode ser removido ou rebaixado, inclusive pelo cadastro de vínculo de conta existente.

Em Aprovadores → Aprovação por perfil, o administrador pode substituir, desativar e reativar atribuições locais, informando o motivo. Atribuições regionais compartilhadas são gerenciadas pelo administrador da plataforma. As alterações valem para novas submissões e não removem acessos já concedidos às unidades. Para transferir uma aprovação ainda pendente, use a opção de substituição no documento e registre o motivo; decisões concluídas permanecem intactas. O histórico registra cada transferência. A fila de avisos é ajustada por responsável, preservando envios em andamento ou de resultado incerto para revisão manual. Execute `npm run db:setup` antes de iniciar a versão atualizada para aplicar a migração `005-approver-management.sql`.

A desativação impede novas requisições online e cancela avisos pendentes quando o processo os reavalia. Não apaga assinaturas, fotos, decisões nem cópias já baixadas em dispositivos offline. Mudanças só passam pela validação do servidor após reconectar. PTs com fotos não podem trocar de terceirizada ou APR; crie uma nova PT para preservar o contexto das evidências. O envio de foto e a alteração da PT usam a mesma trava do documento para evitar troca de vínculo durante uma captura em trânsito.
