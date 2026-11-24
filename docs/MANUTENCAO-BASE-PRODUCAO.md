# Limpeza da base e carga de validação

Estes scripts operam sobre o PostgreSQL **existente** do Nexus PTW. Não reinstalam o banco, não removem volumes e não alteram outros apps ou o Traefik. **São operações de manutenção com pausa do app e dos workers**, diferentes da atualização online normal.

Os scripts foram gerados e testados em ambiente isolado. A limpeza não foi executada na VPS.

## Pré-requisitos

- App atualizado, com as migrações até 020 e imagem do worker disponível no Docker.
- Instalação padrão em `/opt/nexus-ptw`, com `deploy/.env.production` preservado. Para outro caminho, exporte `PTW_INSTALL_DIR` antes de chamar os scripts.
- PostgreSQL, app e worker ativos. O operador precisa de acesso ao Docker e aos arquivos da instalação.
- Nenhum deploy em andamento. As mesmas travas de atualização são respeitadas.

Atualize os arquivos do repositório antes de usar:

```bash
cd /opt/nexus-ptw && git pull --ff-only origin main
```

Se o app ainda estiver em versão anterior, use primeiro o atualizador normal `scripts/update_vps.sh`.

## 1. Limpar os dados

**Apaga** empresas, regionais, unidades, contratadas, usuários comuns, vínculos, aprovadores, APR/PT, versões, fotos, documentos pessoais, Cartões CNPJ, convites, filas e históricos. Também encerra as sessões, inclusive as do Superadmin.

**Preserva** todos os usuários Superadmin e seus hashes de senha, seus dados de segurança, os registros globais de Resend/OpenWA e o histórico das migrações. Se uma configuração global tiver sido gravada por usuário comum, sua autoria técnica passa ao Superadmin preservado para não manter referência a uma conta removida. Chaves e demais valores da configuração permanecem iguais.

```bash
bash /opt/nexus-ptw/scripts/clean_production.sh --confirmar-limpeza
```

Sem `--confirmar-limpeza`, o script recusa a operação. Antes de alterar dados, ele para apenas app/workers do projeto, faz um `pg_dump` e mostra o caminho do backup em `data/backups`. Backup que falhar ou ficar vazio impede a limpeza; arquivos `.partial` não são backups concluídos. A exclusão roda em transação e recusa tabelas desconhecidas, sem `CASCADE` genérico. Uma falha SQL desfaz a transação. Os serviços que estavam ativos são reiniciados ao finalizar, inclusive em caso de erro.

**Após limpar, não haverá empresa ou unidade. Execute a carga abaixo antes de validar o app.** O Superadmin mantém o mesmo login e senha, mas ficará sem contexto de unidade até essa carga.

Configurações e pareamentos específicos de empresas são removidos. O script não chama o OpenWA nem exclui sessões na VPS do gateway; se necessário, remova sessões antigas pelo painel do OpenWA antes de conectar novamente. Backups, `.env.production` e bundles do app não são apagados. Dados já baixados em navegadores não são apagados remotamente; as sessões antigas deixam de valer no servidor.

## 2. Criar cadastros fictícios

```bash
bash /opt/nexus-ptw/scripts/seed_validation.sh
```

O terminal solicita uma senha para os **12 usuários fictícios**, com mínimo de oito caracteres, maiúscula e símbolo. A senha não é mostrada, não é passada nos argumentos do Docker e não altera a senha do Superadmin. Para execução não interativa, disponibilize `PTW_VALIDATION_PASSWORD` no ambiente por um mecanismo seguro; não grave essa senha no Git.

A carga exige base sem empresas e sem usuários comuns. Não sobrescreve cadastros e não pode ser aplicada duas vezes sem limpeza. Também gera backup antes da carga e usa transação. Cria:

- Uma empresa fictícia com dados completos de contato/endereço e limite de **uma unidade**.
- Uma regional e uma unidade CDD.
- Duas contratadas fictícias, Alpha e Beta, autorizadas nessa unidade.
- Seis usuários internos e três usuários para cada contratada.
- Os sete perfis de aprovação de APR/PT configurados.
- Vínculo dos Superadmins ativos à unidade, sem alterar seus usuários ou senhas.

| Perfil | E-mail de login |
| --- | --- |
| Admin da Empresa | `admin.empresa@validacao.example.test` |
| Admin da Unidade | `admin.unidade@validacao.example.test` |
| Gestor interno | `gestor@validacao.example.test` |
| Segurança do Trabalho interna | `seguranca@validacao.example.test` |
| Aprovador | `aprovador@validacao.example.test` |
| Executor interno | `executor@validacao.example.test` |
| Gestor Contratada Alpha | `gestor.alpha@validacao.example.test` |
| Segurança Contratada Alpha | `seguranca.alpha@validacao.example.test` |
| Executor Contratada Alpha | `executor.alpha@validacao.example.test` |
| Gestor Contratada Beta | `gestor.beta@validacao.example.test` |
| Segurança Contratada Beta | `seguranca.beta@validacao.example.test` |
| Executor Contratada Beta | `executor.beta@validacao.example.test` |

O resultado lista os usuários e seus CPFs **sintéticos**, armazenados cifrados. Cada hash de senha tem seu próprio salt. E-mails usam domínio de teste e telefones são fictícios. **Nenhuma APR, PT, foto, documento de identidade ou convite é criado e nenhuma mensagem é enviada.** Não há identidade/documento marcado automaticamente como aprovado. MFA e exigência de documentos começam desativados para essa empresa fictícia; ative-os no app para validar essas etapas.

Para testar entrega de e-mail/WhatsApp e cadastro por link, use o fluxo normal no app com contatos reais sob seu controle. A carga apenas prepara cadastros e perfis: não simula envio, aprovação cadastral ou assinatura.

## Conferência e recuperação

Faça novo login; não reutilize a tela ou a sessão anterior à limpeza. Confira os menus de cada perfil e o isolamento entre Alpha/Beta. O Admin da Empresa terá a auditoria; o Superadmin deve continuar oculto para os usuários da empresa. Crie APR/PT manualmente quando quiser validar a operação.

O backup é local e contém os dados anteriores. Preserve também a chave de criptografia e `.env.production` em armazenamento seguro. Restauração de backup é uma operação separada; o script não restaura nem mistura dados automaticamente. Se houver erro, confira o último backup completo e os serviços do Docker antes de repetir a operação. Após validar, execute a limpeza novamente para retirar as contas fictícias antes de cadastrar dados reais.
