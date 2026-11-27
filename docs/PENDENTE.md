# Nexus PTW — pendências

Atualizado em 27/11/2026. Este arquivo reúne trabalho ainda não concluído; não é um laudo de segurança.

## Recuperação de senha

- Aplicar a migração 021 e atualizar app/worker pelo atualizador da VPS. Homologar **Esqueci minha senha**, entrega real pelo Resend, abertura do link em celular, nova senha e login com MFA quando exigido.
- Recuperação é por e-mail. Perda do autenticador continua no fluxo assistido existente; redefinir senha não remove MFA.
- O teto global de cem solicitações por quinze minutos é adequado ao MVP e precisa ser revisto ao ampliar o número de clientes; sob abuso, novas solicitações aguardam a próxima janela.

## Adequação às diretrizes de C:\Projetos

- Atualização sem interrupção validada em produção pelo responsável em 27/11/2026. Manter monitoramento de capacidade e backups; testes de restauração e alta disponibilidade são assuntos independentes.

- A migração para Python/FastAPI/SQLAlchemy/Alembic foi descartada pelo responsável pelo projeto. Manter Next.js/TypeScript, Zod, `pg`, PostgreSQL e migrações SQL incrementais. Não há pendência de substituir o backend ou reorganizar toda a aplicação para seguir a estrutura Python genérica.
- Melhorar a separação entre transporte, regras de negócio e acesso a dados dentro da stack atual, somente nos escopos autorizados, sem refatoração geral como efeito colateral.
- Manter lint completo, typecheck e testes aprovados nas próximas alterações. Os diagnósticos do GTS foram corrigidos em 19/11/2026, sem desativar regras; o detalhamento está em `IMPLEMENTADO.md`.
- Revisar contratos explícitos de API, tipagem, nomes, tratamento de erros e casts contra as novas regras. As rotas atuais ainda possuem consultas e lógica incompatíveis com a separação exigida.
- Implementar e validar RLS/FORCE RLS, papéis de runtime sem privilégios de superusuário/BYPASSRLS e escopo de empresa por transação. O código atual não contém essas policies; autorização na API não substitui essa adequação.
- Complementar a proteção de origem existente com token CSRF separado, conforme as diretrizes, preservando os fluxos web e offline.
- Revisar limites persistentes por IP/identidade, confiança nos proxies, CSP e cabeçalhos, segredos, dependências e automações de segurança. Não importar resultados, versões ou exceções históricas do RotaFY como evidência deste projeto.
- Adaptar política de privacidade, termos, canais de direitos dos titulares, finalidades de coleta e compartilhamentos ao Nexus PTW. Textos e condições comerciais de turismo não devem ser copiados como se fossem aplicáveis ao produto de segurança do trabalho.
- Validar acessibilidade automatizada e manual, navegação por teclado, leitores de tela, contraste, diálogos e dispositivos reais. Ferramentas adicionais seguem a regra de autorização prévia.
- Preservar o modelo de deploy online existente em novas migrações e alterações; não retornar ao fluxo antigo que interrompia o app.

## Produto e operação

- Validar com o contratante regras de validade, turnos, liberação/encerramento de PT e assinaturas DocuSign/Certisign; configuração de fornecedor não equivale a integração de assinatura concluída.
- Validar a implantação real na VPS, TLS/Traefik, credenciais, notificações, isolamento de rede, backup e restauração. Não há certificação desses controles por testes locais.
- Definir descarte ao fim da retenção e tratamento de backups/cópias. O prazo mínimo de cinco anos está registrado para os documentos pessoais, mas não há exclusão automática ao vencê-lo.
- Confirmar com o cliente se deseja ativar a exigência de documentos: o padrão é desativado. Ao ativar, colaboradores externos já cadastrados também precisam de documento validado; nenhuma identidade é validada automaticamente pela migração.
- Planejar armazenamento na cloud do cliente e dimensionamento para as unidades previstas, conforme o produto evoluir.

### Homologação do cadastro de contratadas por convite

Homologar na VPS a migração 020 e o ciclo de PT (aprovação interna, foto de conclusão, encerramento, reabertura e prorrogação no mesmo dia), incluindo os avisos reais e as telas em celular. A integração de assinaturas e liberação operacional formal permanecem pendentes; os documentos do piloto preservam o aviso correspondente.

Os testes legados `test_update_preserves_environment_and_never_recreates_database` e `test_existing_credentials_preserved_and_migration_precedes_workers` em `deploy_vps_test.py` ainda assumem o fluxo anterior ao deploy online. Em Linux falham pelos mocks/imports antigos; precisam ser adequados ao `RollingDeployment`. O teste específico da nova senha gerada pelo instalador passou. Homologar também os botões de visualizar senha no navegador/celular; nenhuma atualização foi executada na VPS nesta alteração.

- Aplicar a migração 019 e atualizar app/worker na VPS pelo atualizador existente.
- Validar e-mails reais de cadastro, devolução e senha, além dos avisos por WhatsApp após aprovação. Nenhum provedor real foi acionado nos testes automatizados.
- Homologar o formulário público e os popups em navegador/celular.
- Revisar perfis legados da contratada quando necessário; não há conversão automática dos acessos existentes.
