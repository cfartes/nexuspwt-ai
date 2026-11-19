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
- Responsável da contratada cadastra executores e envia RG/CNH/passaporte. Admin/gestor interno da unidade valida ou devolve. Novos executores desse fluxo ficam bloqueados para uso em APR/PT enquanto pendentes.
- Documentos pessoais cifrados no PostgreSQL, download autorizado e auditado, preservação de versões e retenção mínima registrada de cinco anos por envio.
- Auditoria da empresa somente para Admin da Empresa, com filtros, paginação e detalhes em popup.
- Scripts incrementais de instalação/atualização com PostgreSQL e Traefik; atualização preserva o banco existente.

## Validação e limites

A última entrega funcional (`a4f8cfa`) passou pelos testes automatizados, build e integração locais informados no README e na entrega. Não houve validação visual completa no navegador nesta etapa nem atualização da VPS por esta sessão.

O GTS 7.0.0 foi instalado como dependência de desenvolvimento com versão fixa e lockfile atualizado. A configuração ESLint foi adaptada ao ESM do projeto, preservando o estilo Prettier existente e ignorando somente saídas geradas/dependências/dados locais. Scripts de teste usam `npm` de forma compatível com Windows/Linux; não há hook `prepare` que tente compilar durante a instalação de dependências antes da cópia do código no Docker.

A dependência transitiva `tmp` foi fixada em 0.2.7 por override para corrigir os alertas encontrados na instalação. `npm audit`, typecheck e lint dos arquivos de configuração passaram. O lint completo executa, mas a execução local revelou 405 erros e 5 avisos no código existente; não foi aplicada correção automática ampla. Isso não representa aprovação do lint global. As pendências estão em [PENDENTE.md](PENDENTE.md).
