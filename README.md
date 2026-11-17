# Nexus PTW AI

Primeira base executável do MVP de gestão de APR e PT para Ambev e suas unidades.
Aplicação local, destinada às VPS do projeto. Nenhum serviço foi publicado e nenhum documento autoriza execução nesta fase.

## Implementado

- Next.js, React e TypeScript, interface responsiva em português.
- Login individual, senha com scrypt, sessão em cookie HttpOnly, limite de tentativas e validação de origem nas alterações.
- PostgreSQL com SQL parametrizado e migração inicial. Foi usado `pg` diretamente nesta primeira versão para evitar adicionar um ORM além do SQL necessário.
- Empresa, regional, unidade, usuários por unidade, terceirizadas e autorização por unidade. Reutilize o mesmo CNPJ da terceirizada em outra unidade da empresa para criar o vínculo.
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
- Docker Compose do app e configuração separada para instalação própria do Documenso.

## Executar com PostgreSQL

Requer Node.js 24 e PostgreSQL 17. O Docker instalado nesta estação estava sem o daemon iniciado; os testes usaram PostgreSQL embarcado (PGlite), apenas em desenvolvimento.

1. Execute `npm ci`.
2. Copie `.env.example` para `.env.local`.
3. Informe `DATABASE_URL`, `BOOTSTRAP_EMAIL`, uma `BOOTSTRAP_PASSWORD` de pelo menos 12 caracteres e o nome da unidade em `BOOTSTRAP_UNIT`.
4. Execute `npm run db:setup`. Cria o schema, Ambev, unidade piloto e administrador se ainda não existir administrador da plataforma. Não redefine senhas existentes.
5. Execute `npm run dev` e acesse <http://localhost:3000>.
6. Após criar o primeiro acesso, remova a senha de bootstrap do arquivo de ambiente.

Não há senha padrão, conta pública ou demonstração com dados simulados no aplicativo.

Em Configurações, cadastre primeiro terceirizada, usuários e aprovadores. Para aproveitar aprovador regional, crie uma regional, cadastre a unidade nessa regional, dê acesso ao aprovador e atribua o perfil regional. Convites e recuperação de senha ainda não estão implementados.

## Validação

```powershell
npm test
npm run typecheck
npm run build
npm run test:integration
```

O teste de integração abre temporariamente um PostgreSQL embarcado na porta local 55439 e o app na porta 3109, cria credenciais aleatórias somente na memória e encerra os dois ao finalizar. Não utiliza a VPS nem dados reais.

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
- Documenso: instalação será feita pelo usuário; há arquivos de implantação, mas ainda não há integração funcional, webhook ou envio de PDFs. Informar URL/token no ambiente não ativa a integração.
- OpenWA: instalação já existe, mas contrato da API e credenciais ainda não foram fornecidos. Nenhuma mensagem é enviada.
- Impressão: modelo estruturado inicial, não homologado como reprodução fiel. Ainda faltam modelos originais em branco, papel, folhas de continuação e validação visual com o cliente. Upload e reconstrução automática de modelos não foram implementados.
- Offline: primeiro login e download do workspace exigem internet. O acesso offline se limita à sessão previamente autenticada na mesma aba. A sincronização requer app aberto/reaberto; não há promessa de envio com app fechado. Fechar sem salvar perde as alterações do formulário.
- Dados locais são separados por usuário e removidos no logout; logout é bloqueado quando há fila pendente. Limpar dados do navegador ou perder o aparelho pode eliminar itens ainda não sincronizados. Dispositivo compartilhado precisa de proteção local antes do uso operacional.
- Acesso executante lista apenas documentos próprios, PTs em que está vinculado e APRs aprovadas da unidade. Ainda falta associar o empregador ao cadastro do usuário para restringir também por terceirizada.
- O isolamento usa permissões no servidor e chaves compostas entre empresa/unidade/terceirizada; políticas RLS no PostgreSQL ainda não foram implementadas. Homologação de segurança é necessária antes de expor dados reais de múltiplos clientes.
- Guarda de cinco anos é requisito registrado, não uma política de backup já executada. Antes do uso real, definir o marco inicial da retenção, configurar backups externos de banco e certificado e testar restauração. Não existe exclusão automática.
- IA, cobrança do SaaS e integração com cloud do cliente ficam fora desta primeira etapa.
- Não houve teste com celular físico ou implantação Linux. A implantação Docker foi validada estruturalmente, sem construir containers nesta estação.

## Próxima integração

Após instalar o Documenso seguindo `deploy/documenso/README.md`, disponibilize domínio e uma forma segura de configurar o token da equipe. Ainda precisamos mapear campos e signatários por versão, validar o ciclo real de assinatura, autenticar os eventos e arquivar o PDF final sem regenerá-lo.
