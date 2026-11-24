# Graph Report - Nexus PTW  (2026-11-24)

## Corpus Check
- 209 files · ~304,190 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 4, .example 2, .css 2)

## Summary
- 1053 nodes · 3324 edges · 63 communities (41 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aefa1224`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HttpError
- upgrade_openwa.py
- integrations.ts
- permissions.ts
- 001-initial.sql
- document-editor.tsx
- environment
- decryptSecret
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
- api
- notifications
- Communities (43 total, 16 thin omitted)
- gts
- .prettierrc.json
- index.ts
- AGENTS.md
- install_vps.sh
- update_vps.sh
- .scenario
- ContractorPublicRegistration.tsx
- permissions.ts
- pg
- Atualização do OpenWA 0.24.0 para 0.32.0
- .scenario
- workspace.tsx
- api
- Popup
- production-data.ts
- api.integration.ts
- clean_production.sh
- seed_validation.sh
- contractorRegistration.ts
- Graph Report - Nexus PTW  (2026-11-24)
- WorkspaceData
- reset_validation_passwords.sh
- encryptSecret
- app-release.test.ts

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 132 edges
2. `apiError()` - 69 edges
3. `currentUser()` - 60 edges
4. `api()` - 59 edges
5. `unitAccess()` - 58 edges
6. `pg` - 45 edges
7. `assertOrigin()` - 44 edges
8. `Communities (65 total, 24 thin omitted)` - 42 edges
9. `transaction()` - 42 edges
10. `react` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Homologação do cadastro de contratadas por convite` --references--> `RollingDeployment`  [INFERRED]
  docs/PENDENTE.md → scripts/rolling_deploy.py
- `God Nodes (most connected - your core abstractions)` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx
- `God Nodes (most connected - your core abstractions)` --references--> `Workspace()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx
- `Surprising Connections (you probably didn't know these)` --references--> `RollingDeployment`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → scripts/rolling_deploy.py
- `Surprising Connections (you probably didn't know these)` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx

## Import Cycles
- 2-file cycle: `src/components/document-editor.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 2-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/security-settings.tsx`
- 2-file cycle: `src/components/approval-confirmation.tsx -> src/components/workspace.tsx -> src/components/approval-confirmation.tsx`
- 2-file cycle: `src/components/audit-panel.tsx -> src/components/workspace.tsx -> src/components/audit-panel.tsx`
- 2-file cycle: `src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/contractor-team.tsx`
- 2-file cycle: `src/components/notification-panel.tsx -> src/components/workspace.tsx -> src/components/notification-panel.tsx`
- 2-file cycle: `src/components/PersonalDocuments.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 3-file cycle: `src/components/document-editor.tsx -> src/components/reassign-approval.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 3-file cycle: `src/components/admin-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/admin-panel.tsx`
- 3-file cycle: `src/components/contractor-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/contractor-editor.tsx`
- 3-file cycle: `src/components/approver-settings.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/approver-settings.tsx`
- 3-file cycle: `src/components/delete-registration.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/delete-registration.tsx`
- 3-file cycle: `src/components/company-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/company-editor.tsx`
- 3-file cycle: `src/components/people-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/people-panel.tsx`
- 3-file cycle: `src/components/PersonalDocuments.tsx -> src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 3-file cycle: `src/components/ContractorRegistrations.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/ContractorRegistrations.tsx`
- 3-file cycle: `src/components/IdentityUploadSettings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/IdentityUploadSettings.tsx`
- 3-file cycle: `src/components/resend-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/resend-settings.tsx`
- 3-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/security-settings.tsx`
- 3-file cycle: `src/components/integration-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/integration-settings.tsx`

## Communities (63 total, 22 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.06
Nodes (99): God Nodes (most connected - your core abstractions), zod, GET(), name, POST(), role, schema, GET() (+91 more)

### Community 1 - "upgrade_openwa.py"
Cohesion: 0.06
Nodes (21): choose(), load_env(), main(), output(), routing(), output(), run(), candidate_config() (+13 more)

### Community 2 - "integrations.ts"
Cohesion: 0.24
Nodes (12): registrationLink(), processContractorRegistrationInvite(), decryptSecret(), encryptionKey(), httpsUrl, integrationSchema, IntegrationSettings, secret (+4 more)

### Community 3 - "permissions.ts"
Cohesion: 0.28
Nodes (7): AuditData, AuditEvent, AuditPanel(), dateTime(), detailLabels, emptyFilters, auditActionLabels

### Community 4 - "001-initial.sql"
Cohesion: 0.07
Nodes (42): approvals, approver_assignment, approvers, audit_events, companies, contractor_units, contractors, document_versions (+34 more)

### Community 5 - "document-editor.tsx"
Cohesion: 0.13
Nodes (33): CameraCapture(), DocumentEditor(), Photo, labels, PtLifecycleControls(), create(), removeDocument(), save() (+25 more)

### Community 6 - "environment"
Cohesion: 0.06
Nodes (41): build, depends_on, environment, ports, restart, context, dockerfile, target (+33 more)

### Community 7 - "decryptSecret"
Cohesion: 0.18
Nodes (25): phone, IntegrationRow, approvalMessage(), processNotification(), stillPending(), businessPhone(), checkCooldown(), checkOpenwaSession() (+17 more)

### Community 8 - "Nexus PTW AI"
Cohesion: 0.05
Nodes (40): Cadastro da contratada por convite — 24/11/2026, Ciclo da PT no mesmo dia — 24/11/2026, Data de emissão da PT — 24/11/2026, Decisão de arquitetura, Diretrizes adotadas, Funcionalidades disponíveis no código, Nexus PTW — implementado, Remoção da conferência manual em Pessoas e acessos — 24/11/2026 (+32 more)

### Community 9 - "package.json"
Cohesion: 0.10
Nodes (25): devDependencies, @electric-sql/pglite@^0.5.16, @electric-sql/pglite-socket@^0.2.19, fake-indexeddb@^6.2.8, prettier@^3.10.1, @types/node@^24.10.0, @types/pg@^8.15.6, @types/qrcode@^1.5.6 (+17 more)

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
Cohesion: 0.15
Nodes (13): dependencies, idb@^8.0.3, lucide-react@^0.468.0, pg@^8.16.3, qrcode@^1.5.4, react@19.3.1, react-dom@19.3.1, tsx@^4.23.15 (+5 more)

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

### Community 24 - "api"
Cohesion: 0.16
Nodes (16): metadata, Page(), DefinePassword(), ConfigResponse, IntegrationPanel(), load(), save(), SignatureSettings() (+8 more)

### Community 25 - "notifications"
Cohesion: 0.40
Nodes (5): image, networks, restart, stop_grace_period, notifications

### Community 26 - "Communities (43 total, 16 thin omitted)"
Cohesion: 0.05
Nodes (42): Communities (65 total, 24 thin omitted), Community 0 - "HttpError", Community 10 - "compilerOptions", Community 11 - "scripts", Community 12 - "Formulário 2: PT (Permissão de Trabalho Integrada)", Community 13 - "dependencies", Community 14 - "environment", Community 15 - "x-runtime" (+34 more)

### Community 29 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 44 - "ContractorPublicRegistration.tsx"
Cohesion: 0.15
Nodes (21): metadata, Page(), CompanyEditor(), CompanyFields(), ContractorFields(), find(), ContractorPublicRegistration(), Employee (+13 more)

### Community 45 - "permissions.ts"
Cohesion: 0.24
Nodes (10): deliveryStatuses, Registration, statuses, ContractorRegistrationData, contractorRoleLabels, isContractorManager(), allowedMenus(), canViewAudit() (+2 more)

### Community 46 - "pg"
Cohesion: 0.15
Nodes (13): @electric-sql/pglite, @electric-sql/pglite-socket, pg, client, onlineMigrations(), db, path, User (+5 more)

### Community 47 - "Atualização do OpenWA 0.24.0 para 0.32.0"
Cohesion: 0.15
Nodes (11): Atualização do OpenWA 0.24.0 para 0.32.0, Atualização inicial de 0.24.0 para 0.32.0, Correção do QR Code na versão 0.32.0, Depois da atualização, Executar na VPS, O que o script faz, Se falhar, Diagnóstico da conexão WhatsApp (+3 more)

### Community 49 - "workspace.tsx"
Cohesion: 0.15
Nodes (18): actions, DocumentHistory(), History, ReassignApproval(), RegistrationTab, RemovableDocument, RemoveDocument(), DocumentTable() (+10 more)

### Community 51 - "api"
Cohesion: 0.17
Nodes (16): Page(), ApprovalConfirmation(), ContractorTeam(), fileData(), Person, statuses, Team, Notification (+8 more)

### Community 52 - "Popup"
Cohesion: 0.33
Nodes (14): lucide-react, react, AdminPanel(), ApproverSettings(), Assignment, ContractorEditor(), ContractorRegistrations(), DeleteRegistration() (+6 more)

### Community 53 - "production-data.ts"
Cohesion: 0.21
Nodes (12): businessTables, cleanProductionData(), cnpjFor(), cpfFor(), maintenance(), preservedTables, resetValidationPasswords(), seedValidationData() (+4 more)

### Community 54 - "api.integration.ts"
Cohesion: 0.29
Nodes (5): {
  rows: [company],
}, {
  rows: [unit],
}, {
  rows: [user],
}, server, socket

### Community 57 - "contractorRegistration.ts"
Cohesion: 0.20
Nodes (19): POST(), GET(), POST(), identitySnapshot(), contractorContact(), contractorRegistrationData, email, registrationByToken() (+11 more)

### Community 58 - "Graph Report - Nexus PTW  (2026-11-24)"
Cohesion: 0.20
Nodes (9): Community Hubs (Navigation), Corpus Check, Graph Freshness, Graph Report - Nexus PTW  (2026-11-24), Import Cycles, Knowledge Gaps, Suggested Questions, Summary (+1 more)

### Community 59 - "WorkspaceData"
Cohesion: 0.47
Nodes (5): IdentityUploadSettings(), SecuritySettings(), SettingsPanel(), UnitLimitSettings(), WorkspaceData

### Community 62 - "encryptSecret"
Cohesion: 0.20
Nodes (20): DELETE(), dummyHash, POST(), POST(), schema, authenticateDecision(), cpfDigest(), recordIdentity() (+12 more)

## Knowledge Gaps
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RollingDeployment` connect `upgrade_openwa.py` to `Nexus PTW AI`, `Graph Report - Nexus PTW  (2026-11-24)`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `HttpError` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`HttpError` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.06389261744966443 - nodes in this community are weakly interconnected._
- **Why does `Suggested Questions` connect `Graph Report - Nexus PTW  (2026-11-24)` to `HttpError`, `upgrade_openwa.py`, `integrations.ts`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `apiError()` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`apiError()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `upgrade_openwa.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06392405063291139 - nodes in this community are weakly interconnected._
- **Why does `HttpError` connect `HttpError` to `integrations.ts`, `document-editor.tsx`, `decryptSecret`, `contractorRegistration.ts`, `Graph Report - Nexus PTW  (2026-11-24)`, `encryptSecret`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._