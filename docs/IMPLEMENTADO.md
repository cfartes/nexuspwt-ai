# Nexus PTW — implementado

Atualizado em 19/11/2026. Este registro descreve código implementado e validações locais; não comprova implantação na VPS nem conformidade integral.

## Diretrizes adotadas

Foram lidos os arquivos `C:\Projetos\agents.md` e `C:\Projetos\REGRAS_E_DIRETRIZES_SEGURANCA_PRIVACIDADE_ACESSIBILIDADE.md`, por solicitação do responsável pelo projeto. Suas diretrizes passam a orientar o desenvolvimento, respeitando as decisões explícitas do usuário. Referências específicas do RotaFY, como domínio, papéis, contratos e evidências de testes, não são declarações sobre o Nexus PTW.

Antes de novas funcionalidades, pesquisar os projetos existentes em `C:\Projetos` para reaproveitamento. Manter este arquivo e `PENDENTE.md`, separar o que existe do que está planejado, preservar dados e limitar mudanças ao escopo solicitado. Novas dependências e instalação de skills exigem autorização conforme as diretrizes recebidas.

## Decisão de arquitetura

Por decisão explícita do responsável pelo projeto em 19/11/2026, manter o backend em Next.js/TypeScript, com Zod, `pg`, PostgreSQL e as migrações SQL existentes. Não migrar para Python/FastAPI/SQLAlchemy/Alembic nem reorganizar toda a aplicação por exigência do padrão genérico de `C:\Projetos\agents.md`. Esta exceção prevalece para o Nexus PTW; as demais diretrizes de segurança, privacidade, acessibilidade, tipagem e desenvolvimento continuam aplicáveis, adaptadas à stack atual.

## Funcionalidades disponíveis no código

- Empresas, regionais, unidades, cotas de unidades, contratadas e vínculos por unidade; cadastros em popup, máscaras e consulta de CEP/IBGE.
- Perfis e autorização no servidor, isolamento por unidade/contratada e proteção das contas Superadmin Nexus nas operações administrativas dos clientes.
- Convites para definição de senha, filas de e-mail/WhatsApp e configurações de Resend/OpenWA com credenciais no servidor.
- MFA TOTP no login quando exigido pela empresa, configuração por QR Code e sessão com limite de oito horas e trinta minutos sem requisições autenticadas. Ações sensíveis de segurança mantêm confirmação adicional.
- APR/PT, revisões, decisões vinculadas à versão, histórico, impressão e evidências fotográficas. A liberação operacional de PT permanece bloqueada conforme as limitações descritas no README.
- Rascunhos e fila de sincronização offline; documentos pessoais não entram nesse cache.
- Admin da Empresa ativa ou desativa o envio de documentos em Configurações, com padrão desativado e alteração auditada. A opção vale para todas as unidades da empresa.
- Com a opção ativa, todos os perfis vinculados à contratada enviam o próprio RG/CNH/passaporte após definir a senha e concluir o login/MFA. Enquanto pendentes, acessam somente o portal do documento. Admin/gestor interno valida ou devolve; a validação é reaproveitada entre unidades da mesma empresa e contratada. O responsável também pode cadastrar executores sem arquivo e enviar convite para o envio individual.
- Desativar a opção não apaga arquivos ou históricos e remove a exigência de upload para operar. A migração incremental é `018-identity-upload-policy.sql`.
- Documentos pessoais cifrados no PostgreSQL, download autorizado e auditado, preservação de versões e retenção mínima registrada de cinco anos por envio.
- Auditoria da empresa somente para Admin da Empresa, com filtros, paginação e detalhes em popup.
- Atualização blue/green com gateway Nginx atrás do Traefik existente, teste de saúde da candidata, confirmação HTTPS, retorno automático por falha e drenagem de requisições antes de parar a versão anterior. PostgreSQL não é reiniciado nem reinstalado; há backup, histórico/checksums e aprovação de migrações compatíveis para deploy online.
- Aviso de nova versão no app, consultado a cada minuto e ao reconectar/voltar à aba. Atualização manual com confirmação para salvar formulários; preserva IndexedDB, rascunhos salvos e filas. Cache do service worker e build identificados por release; bundles públicos anteriores preservados no gateway.

## Validação e limites

A configuração opcional de documentos e o portal de primeiro acesso passaram por 36 testes automatizados, typecheck, build e integração HTTP locais, sem chamadas a provedores reais. Os testes cobrem padrão desativado, permissões, todos os perfis externos, reutilização entre unidades, isolamento por empresa/contratada e preservação dos arquivos ao desativar. A migração 018 foi aplicada somente ao banco local de desenvolvimento. Não houve validação visual completa no navegador nem atualização da VPS por esta sessão.

O GTS 7.0.0 foi instalado como dependência de desenvolvimento com versão fixa e lockfile atualizado. A configuração ESLint foi adaptada ao ESM do projeto, preservando o estilo Prettier existente e ignorando somente saídas geradas/dependências/dados locais. Scripts de teste usam `npm` de forma compatível com Windows/Linux; não há hook `prepare` que tente compilar durante a instalação de dependências antes da cópia do código no Docker.

A dependência transitiva `tmp` foi fixada em 0.2.7 por override para corrigir os alertas encontrados na instalação. `npm audit` passou na instalação. Em 19/11/2026 foram corrigidos os diagnósticos do lint completo: formatação, import não utilizado, tipagem de fixtures e mocks, espera explícita dos testes assíncronos e tratamento de promises/capturas de erro. O ESLint passou a reconhecer os globais reais do service worker somente em `public/sw.js`, sem desativar regras.

O fechamento assíncrono do IndexedDB trata rejeições sem expor dados pessoais. Respostas sem JSON ou nulas do OpenWA/Resend mantêm o resultado incerto, com testes de regressão; a recusa explícita continua bloqueando o envio. Essas correções não exigem migração do banco, novas dependências ou mudança de stack. Outras adequações permanecem em [PENDENTE.md](PENDENTE.md).

Validação desta correção: `npm run lint` sem erros ou avisos, `npm run typecheck`, `npm test` com 36 testes aprovados (incluindo compilação e lint), `npm run build` e `npm run test:integration` aprovados. Nenhum envio real por WhatsApp/e-mail, teste visual no navegador ou atualização da VPS foi executado nesta etapa.

Validação do deploy online: 38 testes Node, quatro testes Python, lint, typecheck, build e integração HTTP aprovados. Imagens Docker do app e worker construídas localmente; teste isolado com PostgreSQL 17 e gateway Nginx realizou 540 requisições durante troca, retorno e nova troca sem falhas HTTP e confirmou bundles antigos acessíveis. Testes também cobrem retomada da versão anterior, recusa de migração não aprovada e rollback de migração com erro. A VPS/Traefik/HTTPS real e o aviso em navegador/celular ainda precisam de validação no ambiente de destino. A primeira adoção exige recarregar uma vez abas que ainda não possuem o detector.

O atualizador identifica as etapas posteriores ao build e apresenta erros de comandos Docker com código de saída e detalhe sanitizado, em vez de apenas `CalledProcessError`. Credenciais conhecidas do ambiente, senhas em URLs e campos sensíveis são ocultados. Seis testes Python cobrem também esse diagnóstico e a proteção dos segredos. A causa da falha relatada na VPS depende da saída específica do servidor; o build concluído não identifica, por si só, qual etapa posterior falhou.

A saída posterior da VPS identificou `No such image: sha256:…` durante preservação dos bundles. A etapa foi corrigida para obter os arquivos antigos por `docker cp` do container ativo, sem precisar executar sua imagem original. App/worker candidatos usam tags exclusivas da execução, em vez do campo interno `.Id`. A cópia usa diretório temporário e preserva o volume público acumulado; não para o app nem toca no PostgreSQL. Sete testes Python incluem regressão desse caso; lint e teste Docker com a nova cópia passaram, com 662 requisições durante trocas/retorno sem falhas HTTP. A confirmação final no servidor permanece pendente.
