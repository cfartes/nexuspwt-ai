# Segurança SaaS — implantação e limites

## Alterações desta entrega

O app usa `nexus_app` e o processo de notificações usa `nexus_worker`. Migrações, bootstrap, manutenção e backup continuam com a credencial administrativa existente. Os dois usuários de runtime não têm superusuário, BYPASSRLS, criação de bancos/roles, replicação, propriedade das tabelas ou permissão de criar objetos no schema público.

A migração 022 habilita **RLS e FORCE RLS** em `documents`, `document_versions`, `approvals`, `photos`, `audit_events`, `executor_identity_submissions` e `executor_identity_files`. Cada conexão recebe temporariamente a prova da sessão atual; o PostgreSQL calcula seu hash, confere a sessão e os vínculos ativos. O hash armazenado na tabela não pode ser usado como prova. Conexões reaproveitadas recebem novamente o contexto, inclusive vazio quando não há sessão. Cookies e parâmetros SQL não devem ser registrados em logs. Os filtros e as permissões das APIs continuam obrigatórios: RLS adiciona isolamento por unidade/contratada, não substitui regras de perfil, versão e ciclo de aprovação.

Documentos pessoais preservam o acesso do próprio colaborador, da gestão autorizada da própria contratada e dos revisores internos, sem alterar as permissões das APIs. O worker não tem acesso a esses arquivos. O menu de auditoria permanece exclusivo do Admin da Empresa; o histórico autorizado de cada APR/PT continua disponível aos perfis do documento. Registros de autenticação/recuperação ainda podem ser inseridos sem sessão, pois são fluxos públicos; o app não recebe permissão para apagar ou alterar o histórico pela política RLS. Backend e administrador do banco continuam componentes confiáveis; não se trata de armazenamento WORM.

A impressão de uma revisão antiga consulta somente o snapshot autorizado, mesmo quando a contratada atual da APR mudou. Uma função SQL de leitura verifica a sessão e o vínculo da revisão antes de devolver o snapshot; não abre o documento atual da outra contratada. Funções privilegiadas têm search_path controlado, EXECUTE restrito e não aceitam a empresa informada pelo navegador como prova de autorização.

Cadastros globais de usuários, autenticação, configurações da plataforma e os formulários públicos por token continuam protegidos nas APIs. Esta entrega **não declara RLS em todas as tabelas**. O worker lê somente os metadados operacionais necessários das APR/PT e os contatos para entrega. Não pode alterar APR/PT, ler seu conteúdo completo, hashes de senha, segredos TOTP ou documentos pessoais. Só pode atualizar os campos de entrega das filas; não pode trocar destinatários, hashes de tokens, vínculos ou reabrir links consumidos.

O startup/healthcheck de produção recusa conexão de runtime privilegiada, participação em outros papéis, tabelas de proteção sem RLS/FORCE ou identidade de role divergente. O instalador gera duas senhas aleatórias distintas, preserva as credenciais já existentes e grava o ambiente com modo 0600. Senhas de runtime só são entregues ao bootstrap para provisionamento; o app não recebe a URL administrativa.

## Requisições HTTP

Todas as mutações das APIs exigem origem exata e token CSRF separado. O cookie é HttpOnly, SameSite Strict, sem Domain; com HTTPS utiliza o prefixo `__Host-` e Secure. O frontend obtém o token em `/api/csrf`, mantém-no em memória e o envia no cabeçalho. Apenas uma recusa explícita de CSRF, antes da operação, permite refazer a tentativa; falhas de rede não provocam repetição automática. Os envios da fila offline usam a mesma função.

Há orçamento persistente de 1.200 requisições/minuto no total e 300 por usuário autenticado ou grupo anônimo, exceto healthcheck/versão. A identidade é confirmada no banco; cookies de sessão inventados não geram orçamentos separados. Login e confirmações de senha têm teto global adicional de 240/minuto. Login mantém o limite por e-mail; recuperação mantém seus limites próprios. Contadores antigos são descartados após um dia. São limites conservadores para o MVP e devem ser dimensionados com métricas. Cabeçalhos `X-Forwarded-For` enviados pelo cliente não são usados como identidade confiável.

Corpos JSON comuns são limitados a 15 MiB durante a leitura, mesmo sem Content-Length. Uploads pessoais mantêm seu limite próprio, inferior a esse teto, permitindo dois arquivos de 5 MB. Os limites dos campos/arquivos continuam validados pelos schemas.

Foram acrescentados HSTS em produção e CSP com bloqueio de objetos, frames, origens externas de conexão, base e destino de formulários. Scripts/estilos inline ainda são permitidos para compatibilidade com o Next.js atual; não se trata de uma CSP com nonces.

## Atualização na VPS

Use o atualizador existente:

```bash
bash /opt/nexus-ptw/scripts/update_vps.sh
```

O instalador complementa o arquivo de ambiente, aplica a migração aditiva, provisiona as senhas e só direciona tráfego à candidata depois do healthcheck com a role restrita. Não reinstala nem reinicia o PostgreSQL. A versão anterior usa suas credenciais anteriores durante a transição e o retorno por falha; não se revoga o administrador do banco.

Abas antigas precisam usar **Atualizar aplicativo** para enviar o token CSRF. Requisições antigas sem token serão recusadas. Preserve rascunhos e filas; não limpe os dados do navegador. O app não força logout ou recarga da página.

## Homologação necessária

Após atualizar, conferir o login de cada perfil, duas empresas/unidades diferentes, uma contratada com duas unidades, convites públicos, upload/revisão de documentos, sincronização offline, APR/PT, exportações e processamento de notificações. Testar também retorno da candidata em falha, backup e restauração com as credenciais administrativas preservadas.

Limitação de tráfego por IP deve ser feita no proxy de entrada depois de confirmar os proxies confiáveis da VPS; não confiar cegamente em cabeçalhos encaminhados. RLS dos cadastros restantes, CSP com nonces, ensaio de carga, revisão independente de segurança, termos/privacidade e gestão de retenção continuam evoluções separadas.

## Referências e verificação

A separação de credenciais é necessária porque superusuários e papéis BYPASSRLS ignoram a proteção por linha, mesmo com FORCE RLS. [Documentação PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). As funções privilegiadas seguem a orientação de search_path e concessão explícita de EXECUTE. [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).

Validação executada em containers descartáveis, sem rede externa, com dados fictícios, ambiente explicitamente permitido, fonte e ferramentas em leitura e escrita apenas em áreas temporárias limitadas. Limites de CPU, memória, processos, arquivos e duração foram aplicados. PostgreSQL 17 real foi usado no fluxo HTTP completo com `nexus_app`; uma verificação separada processou fila com `nexus_worker` e confirmou negações de privilégios. Nenhum provedor externo foi acionado e a VPS não foi modificada.
