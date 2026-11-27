# Graph Report - Nexus PTW  (2026-11-27)

## Corpus Check
- 221 files · ~317,034 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 4, .example 2, .ttf 2)

## Summary
- 1121 nodes · 3557 edges · 65 communities (44 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0fbdbea3`
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
- encryptSecret
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
- admin/route.ts
- Atualização do OpenWA 0.24.0 para 0.32.0
- .scenario
- workspace.tsx
- permissions.ts
- audit.ts
- production-data.ts
- contractorRegistration.ts
- clean_production.sh
- seed_validation.sh
- ref_node_assert
- api
- overrides
- passwordRecovery.ts
- reset_validation_passwords.sh
- executor-identities.ts
- audit-panel.tsx
- api.integration.ts

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 135 edges
2. `apiError()` - 75 edges
3. `currentUser()` - 62 edges
4. `api()` - 59 edges
5. `unitAccess()` - 58 edges
6. `pg` - 49 edges
7. `assertOrigin()` - 48 edges
8. `transaction()` - 46 edges
9. `Communities (61 total, 21 thin omitted)` - 41 edges
10. `react` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Homologação do cadastro de contratadas por convite` --references--> `RollingDeployment`  [INFERRED]
  docs/PENDENTE.md → scripts/rolling_deploy.py
- `God Nodes (most connected - your core abstractions)` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx
- `Surprising Connections (you probably didn't know these)` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx
- `Surprising Connections (you probably didn't know these)` --references--> `apiError()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/http.ts
- `Suggested Questions` --references--> `apiError()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/http.ts

## Import Cycles
- 2-file cycle: `src/components/approval-confirmation.tsx -> src/components/workspace.tsx -> src/components/approval-confirmation.tsx`
- 2-file cycle: `src/components/audit-panel.tsx -> src/components/workspace.tsx -> src/components/audit-panel.tsx`
- 2-file cycle: `src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/contractor-team.tsx`
- 2-file cycle: `src/components/document-editor.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 2-file cycle: `src/components/notification-panel.tsx -> src/components/workspace.tsx -> src/components/notification-panel.tsx`
- 2-file cycle: `src/components/PersonalDocuments.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 2-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/security-settings.tsx`
- 3-file cycle: `src/components/document-editor.tsx -> src/components/reassign-approval.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 3-file cycle: `src/components/approver-settings.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/approver-settings.tsx`
- 3-file cycle: `src/components/admin-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/admin-panel.tsx`
- 3-file cycle: `src/components/contractor-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/contractor-editor.tsx`
- 3-file cycle: `src/components/delete-registration.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/delete-registration.tsx`
- 3-file cycle: `src/components/company-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/company-editor.tsx`
- 3-file cycle: `src/components/IdentityUploadSettings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/IdentityUploadSettings.tsx`
- 3-file cycle: `src/components/integration-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/integration-settings.tsx`
- 3-file cycle: `src/components/resend-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/resend-settings.tsx`
- 3-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/security-settings.tsx`
- 3-file cycle: `src/components/settings-panel.tsx -> src/components/unit-limit-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx`
- 3-file cycle: `src/components/PersonalDocuments.tsx -> src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 3-file cycle: `src/components/ContractorRegistrations.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/ContractorRegistrations.tsx`

## Communities (65 total, 21 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.08
Nodes (86): God Nodes (most connected - your core abstractions), zod, GET(), GET(), runtime, GET(), DELETE(), POST() (+78 more)

### Community 1 - "upgrade_openwa.py"
Cohesion: 0.05
Nodes (30): Community Hubs (Navigation), Corpus Check, Graph Freshness, Graph Report - Nexus PTW  (2026-11-24), Import Cycles, Knowledge Gaps, Suggested Questions, Summary (+22 more)

### Community 2 - "offline.ts"
Cohesion: 0.25
Nodes (16): idb@^8.0.3, idb, acknowledge(), assertNoLocalPtForApr(), cacheWorkspace(), clearLocal(), connections, discardDocument() (+8 more)

### Community 3 - "companyManager"
Cohesion: 0.32
Nodes (15): AdminPanel(), ApproverSettings(), Assignment, CompanyEditor(), ContractorEditor(), ContractorRegistrations(), DeleteRegistration(), IdentityReview() (+7 more)

### Community 4 - "001-initial.sql"
Cohesion: 0.06
Nodes (46): approvals, approver_assignment, approvers, audit_events, companies, contractor_units, contractors, document_versions (+38 more)

### Community 5 - "document-editor.tsx"
Cohesion: 0.20
Nodes (19): CameraCapture(), DocumentEditor(), Photo, DocumentHistory(), labels, PtLifecycleControls(), ReassignApproval(), RemoveDocument() (+11 more)

### Community 6 - "environment"
Cohesion: 0.06
Nodes (41): build, depends_on, environment, ports, restart, context, dockerfile, target (+33 more)

### Community 7 - "encryptSecret"
Cohesion: 0.21
Nodes (18): dummyHash, POST(), POST(), schema, authenticateDecision(), cpfDigest(), recordIdentity(), validCpf() (+10 more)

### Community 8 - "Nexus PTW AI"
Cohesion: 0.04
Nodes (44): Atualização sem interrupção — confirmação em produção, Cadastro da contratada por convite — 24/11/2026, Ciclo da PT no mesmo dia — 24/11/2026, Data de emissão da PT — 24/11/2026, Decisão de arquitetura, Diretrizes adotadas, Funcionalidades disponíveis no código, Nexus PTW — implementado (+36 more)

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
Cohesion: 0.17
Nodes (12): dependencies, exceljs@^4.4.0, lucide-react@^0.468.0, pdfkit@^0.21.0, pg@^8.16.3, qrcode@^1.5.4, react@19.3.1, tsx@^4.23.15 (+4 more)

### Community 14 - "environment"
Cohesion: 0.29
Nodes (12): environment, environment, APP_URL, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_UNIT, COOKIE_SECURE, DATABASE_URL (+4 more)

### Community 15 - "x-runtime"
Cohesion: 0.18
Nodes (10): name, services, volumes, database, x-runtime, APP_URL, DATABASE_URL, INTEGRATIONS_ENCRYPTION_KEY (+2 more)

### Community 16 - "next"
Cohesion: 0.22
Nodes (7): config, next@16.4.6, next, metadata, RootLayout(), viewport, AppUpdateNotice()

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
Cohesion: 0.05
Nodes (41): Communities (61 total, 21 thin omitted), Community 0 - "HttpError", Community 10 - "compilerOptions", Community 11 - "scripts", Community 12 - "Formulário 2: PT (Permissão de Trabalho Integrada)", Community 13 - "dependencies", Community 14 - "environment", Community 15 - "x-runtime" (+33 more)

### Community 29 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 44 - "types.ts"
Cohesion: 0.25
Nodes (13): CompanyFields(), ContractorFields(), find(), MaskedInput(), Company, companyDetails, CompanyDetails, contractorDetails (+5 more)

### Community 45 - "openwa.ts"
Cohesion: 0.17
Nodes (25): IntegrationRow, processInvitation(), approvalMessage(), processNotification(), stillPending(), businessPhone(), checkCooldown(), checkOpenwaSession() (+17 more)

### Community 46 - "admin/route.ts"
Cohesion: 0.17
Nodes (18): name, phone, POST(), role, schema, eligibleApprover(), grantRegionalAccess(), reassignApproval() (+10 more)

### Community 47 - "Atualização do OpenWA 0.24.0 para 0.32.0"
Cohesion: 0.15
Nodes (11): Atualização do OpenWA 0.24.0 para 0.32.0, Atualização inicial de 0.24.0 para 0.32.0, Correção do QR Code na versão 0.32.0, Depois da atualização, Executar na VPS, O que o script faz, Se falhar, Diagnóstico da conexão WhatsApp (+3 more)

### Community 49 - "workspace.tsx"
Cohesion: 0.13
Nodes (19): actions, History, RegistrationTab, RemovableDocument, DocumentTable(), Empty(), groups, NavigationItem (+11 more)

### Community 51 - "permissions.ts"
Cohesion: 0.16
Nodes (16): metadata, Page(), ContractorPublicRegistration(), Employee, registrationRequest(), RegistrationView, deliveryStatuses, Registration (+8 more)

### Community 52 - "audit.ts"
Cohesion: 0.17
Nodes (11): exceljs, auditDetailFields, AuditEvent, columns, ExportInfo, filterLabels, localDate(), metadata() (+3 more)

### Community 53 - "production-data.ts"
Cohesion: 0.08
Nodes (28): react-dom@19.3.1, react-dom, businessTables, cleanProductionData(), cnpjFor(), cpfFor(), maintenance(), preservedTables (+20 more)

### Community 54 - "contractorRegistration.ts"
Cohesion: 0.20
Nodes (18): contractorRegistrationData, email, inviteContractor(), registrationAudit(), registrationByToken(), registrationCard, registrationLink(), registrationPayload() (+10 more)

### Community 57 - "ref_node_assert"
Cohesion: 0.16
Nodes (10): @electric-sql/pglite, @electric-sql/pglite-socket, pg, client, onlineMigrations(), db, path, dynamic (+2 more)

### Community 58 - "api"
Cohesion: 0.14
Nodes (21): Page(), ApprovalConfirmation(), ContractorTeam(), fileData(), Person, statuses, Team, load() (+13 more)

### Community 59 - "overrides"
Cohesion: 0.50
Nodes (4): uuid, overrides, exceljs, tmp

### Community 60 - "passwordRecovery.ts"
Cohesion: 0.21
Nodes (17): confirmPasswordRecovery(), processPasswordRecovery(), recoveryConfirmation, recoveryLink(), recoveryMessage, recoveryRequest, requestPasswordRecovery(), allowRecoveryRequest() (+9 more)

### Community 62 - "executor-identities.ts"
Cohesion: 0.30
Nodes (11): identitySnapshot(), contractorContact(), contractorRoleValues, executorSubmission, identityFile(), reviewExecutor(), submitExecutor(), acceptInvitation() (+3 more)

### Community 63 - "audit-panel.tsx"
Cohesion: 0.25
Nodes (9): AuditData, AuditEvent, AuditPanel(), exportReport(), dateTime(), emptyFilters, update(), readApiJson() (+1 more)

### Community 64 - "api.integration.ts"
Cohesion: 0.25
Nodes (6): aprProfiles, {
  rows: [company],
}, {
  rows: [unit],
}, {
  rows: [user],
}, server, socket

## Knowledge Gaps
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RollingDeployment` connect `upgrade_openwa.py` to `Nexus PTW AI`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `HttpError` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`HttpError` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.07746639325586693 - nodes in this community are weakly interconnected._
- **Why does `HttpError` connect `HttpError` to `upgrade_openwa.py`, `document-editor.tsx`, `encryptSecret`, `openwa.ts`, `admin/route.ts`, `contractorRegistration.ts`, `ref_node_assert`, `passwordRecovery.ts`, `executor-identities.ts`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `apiError()` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`apiError()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `upgrade_openwa.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05318352059925094 - nodes in this community are weakly interconnected._
- **Why does `Suggested Questions` connect `upgrade_openwa.py` to `HttpError`, `companyManager`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._