# Graph Report - Nexus PTW  (2026-11-24)

## Corpus Check
- 209 files · ~298,561 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 4, .example 2, .css 2)

## Summary
- 1039 nodes · 3262 edges · 57 communities (36 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f6bcf15a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HttpError
- upgrade_openwa.py
- admin/route.ts
- permissions.ts
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
- contractor-team.tsx
- react
- Atualização do OpenWA 0.24.0 para 0.32.0
- .scenario
- workspace.tsx
- production-data.ts
- Popup
- permissions.ts
- clean_production.sh
- seed_validation.sh
- package.json
- reset_validation_passwords.sh

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 133 edges
2. `apiError()` - 68 edges
3. `currentUser()` - 60 edges
4. `api()` - 60 edges
5. `unitAccess()` - 58 edges
6. `pg` - 45 edges
7. `assertOrigin()` - 44 edges
8. `transaction()` - 42 edges
9. `react` - 37 edges
10. `Communities (54 total, 20 thin omitted)` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Homologação do cadastro de contratadas por convite` --references--> `RollingDeployment`  [INFERRED]
  docs/PENDENTE.md → scripts/rolling_deploy.py
- `Suggested Questions` --references--> `HttpError`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/security.ts
- `Surprising Connections (you probably didn't know these)` --references--> `HttpError`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/security.ts
- `Suggested Questions` --references--> `apiError()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/lib/http.ts
- `God Nodes (most connected - your core abstractions)` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx

## Import Cycles
- 2-file cycle: `src/components/document-editor.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 2-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/security-settings.tsx`
- 2-file cycle: `src/components/audit-panel.tsx -> src/components/workspace.tsx -> src/components/audit-panel.tsx`
- 2-file cycle: `src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/contractor-team.tsx`
- 2-file cycle: `src/components/PersonalDocuments.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 2-file cycle: `src/components/approval-confirmation.tsx -> src/components/workspace.tsx -> src/components/approval-confirmation.tsx`
- 2-file cycle: `src/components/notification-panel.tsx -> src/components/workspace.tsx -> src/components/notification-panel.tsx`
- 2-file cycle: `src/components/remove-apr.tsx -> src/components/workspace.tsx -> src/components/remove-apr.tsx`
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

## Communities (57 total, 21 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.07
Nodes (95): config, God Nodes (most connected - your core abstractions), next, zod, GET(), GET(), DELETE(), dummyHash (+87 more)

### Community 1 - "upgrade_openwa.py"
Cohesion: 0.05
Nodes (30): Community Hubs (Navigation), Corpus Check, Graph Freshness, Graph Report - Nexus PTW  (2026-11-24), Import Cycles, Knowledge Gaps, Suggested Questions, Summary (+22 more)

### Community 2 - "admin/route.ts"
Cohesion: 0.20
Nodes (15): name, POST(), role, schema, eligibleApprover(), grantRegionalAccess(), reassignApproval(), updateApprover() (+7 more)

### Community 3 - "permissions.ts"
Cohesion: 0.24
Nodes (8): AuditData, AuditEvent, AuditPanel(), dateTime(), detailLabels, emptyFilters, auditActionLabels, roleLabels

### Community 4 - "001-initial.sql"
Cohesion: 0.07
Nodes (42): approvals, approver_assignment, approvers, audit_events, companies, contractor_units, contractors, document_versions (+34 more)

### Community 5 - "document-editor.tsx"
Cohesion: 0.13
Nodes (28): CameraCapture(), DocumentEditor(), Photo, DocumentHistory(), labels, PtLifecycleControls(), create(), acknowledge() (+20 more)

### Community 6 - "environment"
Cohesion: 0.06
Nodes (41): build, depends_on, environment, ports, restart, context, dockerfile, target (+33 more)

### Community 7 - "contractorRegistration.ts"
Cohesion: 0.06
Nodes (78): @electric-sql/pglite, @electric-sql/pglite-socket, pg, client, onlineMigrations(), db, path, phone (+70 more)

### Community 8 - "Nexus PTW AI"
Cohesion: 0.05
Nodes (40): Cadastro da contratada por convite — 24/11/2026, Ciclo da PT no mesmo dia — 24/11/2026, Data de emissão da PT — 24/11/2026, Decisão de arquitetura, Diretrizes adotadas, Funcionalidades disponíveis no código, Nexus PTW — implementado, Remoção da conferência manual em Pessoas e acessos — 24/11/2026 (+32 more)

### Community 9 - "package.json"
Cohesion: 0.13
Nodes (15): devDependencies, @electric-sql/pglite@^0.5.16, @electric-sql/pglite-socket@^0.2.19, prettier@^3.10.1, @types/node@^24.10.0, @types/pg@^8.15.6, @types/qrcode@^1.5.6, @types/react-dom@^19.2.2 (+7 more)

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
Cohesion: 0.14
Nodes (14): dependencies, idb@^8.0.3, lucide-react@^0.468.0, next@16.4.6, pg@^8.16.3, qrcode@^1.5.4, react@19.3.1, react-dom@19.3.1 (+6 more)

### Community 14 - "environment"
Cohesion: 0.29
Nodes (12): environment, environment, APP_URL, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_UNIT, COOKIE_SECURE, DATABASE_URL (+4 more)

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

### Community 24 - "api"
Cohesion: 0.16
Nodes (22): metadata, Page(), DefinePassword(), IdentityUploadSettings(), ConfigResponse, IntegrationPanel(), load(), save() (+14 more)

### Community 25 - "notifications"
Cohesion: 0.40
Nodes (5): image, networks, restart, stop_grace_period, notifications

### Community 26 - "Communities (43 total, 16 thin omitted)"
Cohesion: 0.06
Nodes (35): Communities (54 total, 20 thin omitted), Community 0 - "HttpError", Community 10 - "compilerOptions", Community 11 - "scripts", Community 12 - "Formulário 2: PT (Permissão de Trabalho Integrada)", Community 13 - "dependencies", Community 14 - "environment", Community 15 - "x-runtime" (+27 more)

### Community 29 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 44 - "contractor-team.tsx"
Cohesion: 0.31
Nodes (7): ContractorTeam(), fileData(), Person, statuses, Team, PersonalDocuments(), statusLabels

### Community 45 - "react"
Cohesion: 0.16
Nodes (21): react, metadata, Page(), CompanyEditor(), CompanyFields(), ContractorFields(), find(), ContractorPublicRegistration() (+13 more)

### Community 47 - "Atualização do OpenWA 0.24.0 para 0.32.0"
Cohesion: 0.15
Nodes (11): Atualização do OpenWA 0.24.0 para 0.32.0, Atualização inicial de 0.24.0 para 0.32.0, Correção do QR Code na versão 0.32.0, Depois da atualização, Executar na VPS, O que o script faz, Se falhar, Diagnóstico da conexão WhatsApp (+3 more)

### Community 49 - "workspace.tsx"
Cohesion: 0.11
Nodes (23): Page(), ApprovalConfirmation(), actions, History, Notification, NotificationPanel(), statuses, ReassignApproval() (+15 more)

### Community 51 - "production-data.ts"
Cohesion: 0.12
Nodes (19): businessTables, cleanProductionData(), cnpjFor(), cpfFor(), maintenance(), preservedTables, resetValidationPasswords(), seedValidationData() (+11 more)

### Community 52 - "Popup"
Cohesion: 0.26
Nodes (16): lucide-react, AdminPanel(), ApproverSettings(), Assignment, ContractorEditor(), ContractorRegistrations(), DeleteRegistration(), IdentityReview() (+8 more)

### Community 54 - "permissions.ts"
Cohesion: 0.24
Nodes (9): deliveryStatuses, Registration, statuses, ContractorRegistrationData, ContractorRole, contractorRoleLabels, isContractorManager(), allowedMenus() (+1 more)

### Community 57 - "package.json"
Cohesion: 0.18
Nodes (10): fake-indexeddb@^6.2.8, @types/react@^19.2.2, name, overrides, tmp, private, type, version (+2 more)

## Knowledge Gaps
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RollingDeployment` connect `upgrade_openwa.py` to `Nexus PTW AI`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `HttpError` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`HttpError` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.07126436781609195 - nodes in this community are weakly interconnected._
- **Why does `HttpError` connect `HttpError` to `upgrade_openwa.py`, `admin/route.ts`, `document-editor.tsx`, `contractorRegistration.ts`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `apiError()` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`apiError()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `upgrade_openwa.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05318352059925094 - nodes in this community are weakly interconnected._
- **Why does `Surprising Connections (you probably didn't know these)` connect `upgrade_openwa.py` to `api`, `HttpError`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._