# Nexus PTW — pendências

Atualizado em 19/11/2026. Este arquivo reúne trabalho ainda não concluído; não é um laudo de segurança.

## Adequação às diretrizes de C:\Projetos

- Planejar a migração incremental do backend atual (rotas Next.js, Zod e `pg`) para Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async e PostgreSQL. Preservar dados, contratos de API e comportamento autorizado; não reescrever toda a aplicação como efeito colateral de uma alteração pontual.
- Adequar a estrutura a `/backend/src` e `/frontend/src`, separando rotas, serviços, repositórios, schemas, componentes visuais e funcionalidades por domínio. Adotar os padrões de nomes e Tailwind exigidos.
- Planejar a transição das migrações SQL existentes para Alembic, sem reinstalar o banco nem reaplicar operações destrutivas sobre os dados existentes.
- Regularizar o ambiente de lint: o manifesto local possui `gts`, mas `npm run lint` retorna que o comando não é reconhecido. Reconciliar ferramentas, configuração ESM, scripts e lockfile antes de declarar lint aprovado. Não instalar novas dependências sem a autorização exigida.
- Revisar contratos explícitos de API, tipagem, nomes, tratamento de erros e casts contra as novas regras. As rotas atuais ainda possuem consultas e lógica incompatíveis com a separação exigida.
- Implementar e validar RLS/FORCE RLS, papéis de runtime sem privilégios de superusuário/BYPASSRLS e escopo de empresa por transação. O código atual não contém essas policies; autorização na API não substitui essa adequação.
- Complementar a proteção de origem existente com token CSRF separado, conforme as diretrizes, preservando os fluxos web e offline.
- Revisar limites persistentes por IP/identidade, confiança nos proxies, CSP e cabeçalhos, segredos, dependências e automações de segurança. Não importar resultados, versões ou exceções históricas do RotaFY como evidência deste projeto.
- Adaptar política de privacidade, termos, canais de direitos dos titulares, finalidades de coleta e compartilhamentos ao Nexus PTW. Textos e condições comerciais de turismo não devem ser copiados como se fossem aplicáveis ao produto de segurança do trabalho.
- Validar acessibilidade automatizada e manual, navegação por teclado, leitores de tela, contraste, diálogos e dispositivos reais. Ferramentas adicionais seguem a regra de autorização prévia.
- Consultar o modelo de implantação em `C:\RotaFY` e planejar atualização com continuidade de uso. O atualizador atual pausa app/worker durante parte da atualização; não foi estabelecida implantação sem interrupção.

## Produto e operação

- Validar com o contratante regras de validade, turnos, liberação/encerramento de PT e assinaturas DocuSign/Certisign; configuração de fornecedor não equivale a integração de assinatura concluída.
- Validar a implantação real na VPS, TLS/Traefik, credenciais, notificações, isolamento de rede, backup e restauração. Não há certificação desses controles por testes locais.
- Definir descarte ao fim da retenção e tratamento de backups/cópias. O prazo mínimo de cinco anos está registrado para os documentos pessoais, mas não há exclusão automática ao vencê-lo.
- Avaliar os executores legados e inseri-los no fluxo de documentos quando necessário; a migração não declara identidades antigas automaticamente validadas nem invalida todos os acessos existentes.
- Planejar armazenamento na cloud do cliente e dimensionamento para as unidades previstas, conforme o produto evoluir.
