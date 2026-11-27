# Graph Report - Nexus PTW  (2026-11-27)

## Corpus Check
- 232 files · ~329,356 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 4, .example 2, .ttf 2)

## Summary
- 1183 nodes · 3746 edges · 74 communities (53 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `23716801`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HttpError
- upgrade_openwa.py
- offline.ts
- companyManager
- 001-initial.sql
- document-editor.tsx
- environment
- contractorRegistration.ts
- Nexus PTW AI
- package.json
- compilerOptions
- scripts
- Formulário 2: PT (Permissão de Trabalho Integrada)
- dependencies
- environment
- x-runtime
- next
- app
- bootstrap
- database
- labels
- healthcheck
- networks
- build
- react
- notifications
- Communities (43 total, 16 thin omitted)
- gts
- .prettierrc.json
- index.ts
- AGENTS.md
- install_vps.sh
- update_vps.sh
- .scenario
- types.ts
- openwa.ts
- 022-saas-security.sql
- Atualização do OpenWA 0.24.0 para 0.32.0
- .scenario
- workspace.tsx
- permissions.ts
- audit.ts
- production-data.ts
- integrations.ts
- clean_production.sh
- seed_validation.sh
- ref_node_assert
- api
- overrides
- passwordRecovery.ts
- reset_validation_passwords.sh
- pg
- audit-panel.tsx
- api.integration.ts
- define-password.tsx
- Limpeza da base e carga de validação
- proxy.ts
- Subir o app na VPS
- Nexus PTW — implementado
- Validação e limites
- Nexus PTW — pendências
- Segurança SaaS — implantação e limites
- totpQrCode

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 138 edges
2. `apiError()` - 77 edges
3. `currentUser()` - 62 edges
4. `api()` - 60 edges
5. `unitAccess()` - 58 edges
6. `pg` - 54 edges
7. `assertOrigin()` - 50 edges
8. `transaction()` - 46 edges
9. `Communities (65 total, 21 thin omitted)` - 45 edges
10. `readJsonBody()` - 40 edges

## Surprising Connections (you probably didn't know these)
- `Homologação do cadastro de contratadas por convite` --references--> `RollingDeployment`  [INFERRED]
  docs/PENDENTE.md → scripts/rolling_deploy.py
- `Suggested Questions` --references--> `HttpError`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/security.ts
- `Suggested Questions` --references--> `apiError()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/http.ts
- `Surprising Connections (you probably didn't know these)` --references--> `apiError()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/http.ts
- `Suggested Questions` --references--> `companyManager()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/permissions.ts

## Import Cycles
- 2-file cycle: `src/components/document-editor.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 2-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/security-settings.tsx`
- 2-file cycle: `src/components/audit-panel.tsx -> src/components/workspace.tsx -> src/components/audit-panel.tsx`
- 2-file cycle: `src/components/notification-panel.tsx -> src/components/workspace.tsx -> src/components/notification-panel.tsx`
- 2-file cycle: `src/components/approval-confirmation.tsx -> src/components/workspace.tsx -> src/components/approval-confirmation.tsx`
- 2-file cycle: `src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/contractor-team.tsx`
- 2-file cycle: `src/components/PersonalDocuments.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 3-file cycle: `src/components/document-editor.tsx -> src/components/reassign-approval.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 3-file cycle: `src/components/approver-settings.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/approver-settings.tsx`
- 3-file cycle: `src/components/admin-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/admin-panel.tsx`
- 3-file cycle: `src/components/contractor-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/contractor-editor.tsx`
- 3-file cycle: `src/components/delete-registration.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/delete-registration.tsx`
- 3-file cycle: `src/components/company-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/company-editor.tsx`
- 3-file cycle: `src/components/people-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/people-panel.tsx`
- 3-file cycle: `src/components/PersonalDocuments.tsx -> src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 3-file cycle: `src/components/ContractorRegistrations.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/ContractorRegistrations.tsx`
- 3-file cycle: `src/components/IdentityUploadSettings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/IdentityUploadSettings.tsx`
- 3-file cycle: `src/components/resend-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/resend-settings.tsx`
- 3-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/security-settings.tsx`
- 3-file cycle: `src/components/integration-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/integration-settings.tsx`

## Communities (74 total, 21 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.08
Nodes (87): config, God Nodes (most connected - your core abstractions), next, zod, GET(), GET(), DELETE(), dummyHash (+79 more)

### Community 1 - "upgrade_openwa.py"
Cohesion: 0.05
Nodes (30): Community Hubs (Navigation), Corpus Check, Graph Freshness, Graph Report - Nexus PTW  (2026-11-27), Import Cycles, Knowledge Gaps, Suggested Questions, Summary (+22 more)

### Community 2 - "offline.ts"
Cohesion: 0.30
Nodes (14): acknowledge(), assertNoLocalPtForApr(), cacheWorkspace(), clearLocal(), connections, discardDocument(), enqueue(), getLocal() (+6 more)

### Community 3 - "companyManager"
Cohesion: 0.39
Nodes (12): AdminPanel(), ApproverSettings(), Assignment, ContractorRegistrations(), DeleteRegistration(), IdentityReview(), PeoplePanel(), Popup() (+4 more)

### Community 4 - "001-initial.sql"
Cohesion: 0.06
Nodes (46): approvals, approver_assignment, approvers, audit_events, companies, contractor_units, contractors, document_versions (+38 more)

### Community 5 - "document-editor.tsx"
Cohesion: 0.16
Nodes (22): CameraCapture(), DocumentEditor(), Photo, actions, DocumentHistory(), History, labels, PtLifecycleControls() (+14 more)

### Community 6 - "environment"
Cohesion: 0.06
Nodes (41): build, depends_on, environment, ports, restart, context, dockerfile, target (+33 more)

### Community 7 - "contractorRegistration.ts"
Cohesion: 0.22
Nodes (18): POST(), cpfDigest(), recordIdentity(), validCpf(), contractorRegistrationData, email, inviteContractor(), registrationAudit() (+10 more)

### Community 8 - "Nexus PTW AI"
Cohesion: 0.15
Nodes (13): Ativar avisos pelo WhatsApp, Configurar integrações, Convite de primeiro acesso para usuários, Decisões e limitações desta entrega, Encerramento, reabertura e prorrogação da PT, Exclusão de cadastros, Executar com PostgreSQL, Gerenciar pessoas por unidade (+5 more)

### Community 9 - "package.json"
Cohesion: 0.10
Nodes (25): devDependencies, @electric-sql/pglite@^0.5.16, @electric-sql/pglite-socket@^0.2.19, fake-indexeddb@^6.2.8, prettier@^3.10.1, @types/node@^24.10.0, @types/pdfkit@^0.17.7, @types/pg@^8.15.6 (+17 more)

### Community 10 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 11 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, clean, compile, db:setup, dev, fix, lint (+7 more)

### Community 12 - "Formulário 2: PT (Permissão de Trabalho Integrada)"
Cohesion: 0.15
Nodes (12): 1. Cabeçalho e Identificação, 1. Identificação Geral, 2. Classificação da Atividade (Gatilhos de Condicionalidade), 2. Matriz de Análise de Riscos (Tabela Dinâmica / Lista Repetível), 3. Bloco de Assinaturas e Aprovações (4 Perfis), 3. EPIs e Avaliação Obrigatória, 4. Checklists Específicos (Exibição Condicional), 5. Liberação, Revalidação, Executantes e Encerramento (+4 more)

### Community 13 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, exceljs@^4.4.0, idb@^8.0.3, lucide-react@^0.468.0, next@16.4.6, pdfkit@^0.21.0, pg@^8.16.3, react@19.3.1 (+7 more)

### Community 14 - "environment"
Cohesion: 0.20
Nodes (16): environment, environment, APP_DATABASE_PASSWORD, APP_URL, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_UNIT, COOKIE_SECURE (+8 more)

### Community 15 - "x-runtime"
Cohesion: 0.18
Nodes (10): name, services, volumes, database, x-runtime, APP_URL, DATABASE_URL, INTEGRATIONS_ENCRYPTION_KEY (+2 more)

### Community 16 - "next"
Cohesion: 0.38
Nodes (4): metadata, RootLayout(), viewport, AppUpdateNotice()

### Community 17 - "app"
Cohesion: 0.22
Nodes (9): depends_on, image, networks, restart, depends_on, condition, database, depends_on (+1 more)

### Community 18 - "bootstrap"
Cohesion: 0.22
Nodes (9): command, image, labels, networks, profiles, labels, traefik.enable, labels (+1 more)

### Community 19 - "database"
Cohesion: 0.22
Nodes (9): environment, image, networks, restart, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER (+1 more)

### Community 20 - "labels"
Cohesion: 0.25
Nodes (8): labels, traefik.docker.network, traefik.http.routers.nexus-ptw.entrypoints, traefik.http.routers.nexus-ptw.rule, traefik.http.routers.nexus-ptw.service, traefik.http.routers.nexus-ptw.tls, traefik.http.routers.nexus-ptw.tls.certresolver, traefik.http.services.nexus-ptw.loadbalancer.server.port

### Community 21 - "healthcheck"
Cohesion: 0.43
Nodes (7): healthcheck, healthcheck, interval, retries, start_period, test, timeout

### Community 22 - "networks"
Cohesion: 0.29
Nodes (7): internal, networks, database, egress, traefik, external, name

### Community 23 - "build"
Cohesion: 0.60
Nodes (6): build, build, context, dockerfile, target, build

### Community 24 - "react"
Cohesion: 0.24
Nodes (15): lucide-react, react, IdentityUploadSettings(), ConfigResponse, IntegrationPanel(), SignatureSettings(), PasswordInput(), ResendSettings() (+7 more)

### Community 25 - "notifications"
Cohesion: 0.40
Nodes (5): image, networks, restart, stop_grace_period, notifications

### Community 26 - "Communities (43 total, 16 thin omitted)"
Cohesion: 0.04
Nodes (45): Communities (65 total, 21 thin omitted), Community 0 - "HttpError", Community 10 - "compilerOptions", Community 11 - "scripts", Community 12 - "Formulário 2: PT (Permissão de Trabalho Integrada)", Community 13 - "dependencies", Community 14 - "environment", Community 15 - "x-runtime" (+37 more)

### Community 29 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 44 - "types.ts"
Cohesion: 0.24
Nodes (14): CompanyEditor(), CompanyFields(), ContractorEditor(), ContractorFields(), MaskedInput(), Company, companyDetails, CompanyDetails (+6 more)

### Community 45 - "openwa.ts"
Cohesion: 0.18
Nodes (25): phone, IntegrationRow, approvalMessage(), processNotification(), stillPending(), businessPhone(), checkCooldown(), checkOpenwaSession() (+17 more)

### Community 46 - "022-saas-security.sql"
Cohesion: 0.17
Nodes (8): ptw_actor(), ptw_company_access(), ptw_document_access(), ptw_identity_access(), ptw_print_document(), ptw_unit_access(), ptw_version_access(), request_limits

### Community 47 - "Atualização do OpenWA 0.24.0 para 0.32.0"
Cohesion: 0.15
Nodes (11): Atualização do OpenWA 0.24.0 para 0.32.0, Atualização inicial de 0.24.0 para 0.32.0, Correção do QR Code na versão 0.32.0, Depois da atualização, Executar na VPS, O que o script faz, Se falhar, Diagnóstico da conexão WhatsApp (+3 more)

### Community 49 - "workspace.tsx"
Cohesion: 0.14
Nodes (18): RegistrationTab, RemovableDocument, RemoveDocument(), DocumentTable(), Empty(), groups, NavigationItem, WorkspaceNavigation() (+10 more)

### Community 51 - "permissions.ts"
Cohesion: 0.16
Nodes (16): metadata, Page(), ContractorPublicRegistration(), Employee, registrationRequest(), RegistrationView, deliveryStatuses, Registration (+8 more)

### Community 52 - "audit.ts"
Cohesion: 0.14
Nodes (19): exceljs, GET(), runtime, auditDetailFields, AuditEvent, auditFilters, auditScope(), companyAudit() (+11 more)

### Community 53 - "production-data.ts"
Cohesion: 0.08
Nodes (33): businessTables, cleanProductionData(), cnpjFor(), cpfFor(), maintenance(), preservedTables, resetValidationPasswords(), seedValidationData() (+25 more)

### Community 54 - "integrations.ts"
Cohesion: 0.19
Nodes (14): registrationLink(), processContractorRegistrationInvite(), decryptSecret(), encryptionKey(), httpsUrl, integrationSchema, IntegrationSettings, secret (+6 more)

### Community 57 - "ref_node_assert"
Cohesion: 0.23
Nodes (5): @electric-sql/pglite, @electric-sql/pglite-socket, path, dynamic, GET()

### Community 58 - "api"
Cohesion: 0.14
Nodes (20): Page(), ApprovalConfirmation(), find(), ContractorTeam(), fileData(), Person, statuses, Team (+12 more)

### Community 59 - "overrides"
Cohesion: 0.50
Nodes (4): uuid, overrides, exceljs, tmp

### Community 60 - "passwordRecovery.ts"
Cohesion: 0.23
Nodes (16): confirmPasswordRecovery(), processPasswordRecovery(), recoveryConfirmation, recoveryLink(), recoveryMessage, recoveryRequest, requestPasswordRecovery(), allowRecoveryRequest() (+8 more)

### Community 62 - "pg"
Cohesion: 0.20
Nodes (18): pg, GET(), POST(), identitySnapshot(), User, contractorContact(), contractorRoleValues, deleteRegistration() (+10 more)

### Community 63 - "audit-panel.tsx"
Cohesion: 0.25
Nodes (9): AuditData, AuditEvent, AuditPanel(), exportReport(), dateTime(), emptyFilters, update(), readApiJson() (+1 more)

### Community 64 - "api.integration.ts"
Cohesion: 0.15
Nodes (10): client, onlineMigrations(), provisionRuntimeRoles(), db, db, {
  rows: [company],
}, {
  rows: [unit],
}, {
  rows: [user],
} (+2 more)

### Community 65 - "define-password.tsx"
Cohesion: 0.21
Nodes (12): metadata, Page(), metadata, Page(), DefinePassword(), passwordResponse, PasswordRecovery(), recoveryResponse (+4 more)

### Community 66 - "Limpeza da base e carga de validação"
Cohesion: 0.20
Nodes (6): 1. Limpar os dados, 2. Criar cadastros fictícios, Conferência e recuperação, Esqueci a senha dos usuários de validação, Limpeza da base e carga de validação, Pré-requisitos

### Community 67 - "proxy.ts"
Cohesion: 0.36
Nodes (7): GET(), csrfCookieName(), validCsrf(), enforceRequestLimit(), requestIdentity(), config, proxy()

### Community 68 - "Subir o app na VPS"
Cohesion: 0.25
Nodes (8): Atualizar a instalação existente sem reinstalar PostgreSQL, Auditoria da empresa, Conferência humana e segurança das decisões, Contratadas, executores e documentos de identidade, Instalação com o Traefik existente (recomendada), Instalação manual com proxy para porta local, Perfis e permissões, Subir o app na VPS

### Community 69 - "Nexus PTW — implementado"
Cohesion: 0.29
Nodes (7): Atualização sem interrupção — confirmação em produção, Decisão de arquitetura, Diretrizes adotadas, Funcionalidades disponíveis no código, Nexus PTW — implementado, Recuperação de senha — 27/11/2026, Segurança para ampliação do SaaS — 27/11/2026

### Community 70 - "Validação e limites"
Cohesion: 0.33
Nodes (6): Cadastro da contratada por convite — 24/11/2026, Ciclo da PT no mesmo dia — 24/11/2026, Data de emissão da PT — 24/11/2026, Remoção da conferência manual em Pessoas e acessos — 24/11/2026, Senhas e visualização — 24/11/2026, Validação e limites

### Community 71 - "Nexus PTW — pendências"
Cohesion: 0.33
Nodes (6): Adequação às diretrizes de C:\Projetos, Homologação do cadastro de contratadas por convite, Nexus PTW — pendências, Produto e operação, Recuperação de senha, Segurança SaaS — homologação e evolução

### Community 72 - "Segurança SaaS — implantação e limites"
Cohesion: 0.33
Nodes (6): Alterações desta entrega, Atualização na VPS, Homologação necessária, Referências e verificação, Requisições HTTP, Segurança SaaS — implantação e limites

### Community 73 - "totpQrCode"
Cohesion: 0.53
Nodes (4): qrcode@^1.5.4, qrcode, totpQrCode(), totpUri()

## Knowledge Gaps
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RollingDeployment` connect `upgrade_openwa.py` to `Nexus PTW — pendências`?**
  _High betweenness centrality (0.199) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `HttpError` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`HttpError` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.08054226475279107 - nodes in this community are weakly interconnected._
- **Why does `Suggested Questions` connect `upgrade_openwa.py` to `HttpError`, `companyManager`, `contractorRegistration.ts`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `apiError()` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`apiError()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `upgrade_openwa.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05393258426966292 - nodes in this community are weakly interconnected._
- **Why does `HttpError` connect `HttpError` to `upgrade_openwa.py`, `proxy.ts`, `document-editor.tsx`, `contractorRegistration.ts`, `openwa.ts`, `audit.ts`, `production-data.ts`, `integrations.ts`, `passwordRecovery.ts`, `pg`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._