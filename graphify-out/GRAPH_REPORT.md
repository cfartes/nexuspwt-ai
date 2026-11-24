# Graph Report - Nexus PTW  (2026-11-24)

## Corpus Check
- 208 files · ~295,295 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 4, .example 2, .css 2)

## Summary
- 1029 nodes · 3240 edges · 55 communities (35 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `65f677ab`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HttpError
- deploy_vps.py
- integrations.ts
- permissions.ts
- 001-initial.sql
- document-editor.tsx
- environment
- admin/route.ts
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
- ContractorPublicRegistration.tsx
- define-password.tsx
- Atualização do OpenWA 0.24.0 para 0.32.0
- .scenario
- workspace.tsx
- totpQrCode
- Popup
- clean_production.sh
- seed_validation.sh

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 133 edges
2. `apiError()` - 69 edges
3. `currentUser()` - 60 edges
4. `api()` - 60 edges
5. `unitAccess()` - 58 edges
6. `pg` - 45 edges
7. `assertOrigin()` - 44 edges
8. `transaction()` - 42 edges
9. `Communities (56 total, 19 thin omitted)` - 38 edges
10. `react` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Homologação do cadastro de contratadas por convite` --references--> `RollingDeployment`  [INFERRED]
  docs/PENDENTE.md → scripts/rolling_deploy.py
- `God Nodes (most connected - your core abstractions)` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx
- `Surprising Connections (you probably didn't know these)` --references--> `RollingDeployment`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → scripts/rolling_deploy.py
- `Suggested Questions` --references--> `RollingDeployment`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → scripts/rolling_deploy.py
- `Suggested Questions` --references--> `api()`  [INFERRED]
  .planning/graphs/GRAPH_REPORT.md → src/components/workspace.tsx

## Import Cycles
- 2-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/security-settings.tsx`
- 2-file cycle: `src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/contractor-team.tsx`
- 2-file cycle: `src/components/audit-panel.tsx -> src/components/workspace.tsx -> src/components/audit-panel.tsx`
- 2-file cycle: `src/components/PersonalDocuments.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 2-file cycle: `src/components/approval-confirmation.tsx -> src/components/workspace.tsx -> src/components/approval-confirmation.tsx`
- 2-file cycle: `src/components/document-editor.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 2-file cycle: `src/components/notification-panel.tsx -> src/components/workspace.tsx -> src/components/notification-panel.tsx`
- 2-file cycle: `src/components/remove-apr.tsx -> src/components/workspace.tsx -> src/components/remove-apr.tsx`
- 3-file cycle: `src/components/document-editor.tsx -> src/components/reassign-approval.tsx -> src/components/workspace.tsx -> src/components/document-editor.tsx`
- 3-file cycle: `src/components/admin-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/admin-panel.tsx`
- 3-file cycle: `src/components/approver-settings.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/approver-settings.tsx`
- 3-file cycle: `src/components/contractor-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/contractor-editor.tsx`
- 3-file cycle: `src/components/delete-registration.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/delete-registration.tsx`
- 3-file cycle: `src/components/company-editor.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/company-editor.tsx`
- 3-file cycle: `src/components/people-panel.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/people-panel.tsx`
- 3-file cycle: `src/components/PersonalDocuments.tsx -> src/components/contractor-team.tsx -> src/components/workspace.tsx -> src/components/PersonalDocuments.tsx`
- 3-file cycle: `src/components/ContractorRegistrations.tsx -> src/components/workspace.tsx -> src/components/registration-panel.tsx -> src/components/ContractorRegistrations.tsx`
- 3-file cycle: `src/components/IdentityUploadSettings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/IdentityUploadSettings.tsx`
- 3-file cycle: `src/components/resend-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/resend-settings.tsx`
- 3-file cycle: `src/components/security-settings.tsx -> src/components/workspace.tsx -> src/components/settings-panel.tsx -> src/components/security-settings.tsx`

## Communities (55 total, 20 thin omitted)

### Community 0 - "HttpError"
Cohesion: 0.07
Nodes (103): config, God Nodes (most connected - your core abstractions), Surprising Connections (you probably didn't know these), next, zod, GET(), GET(), DELETE() (+95 more)

### Community 1 - "deploy_vps.py"
Cohesion: 0.06
Nodes (20): choose(), load_env(), main(), output(), routing(), output(), run(), candidate_config() (+12 more)

### Community 2 - "integrations.ts"
Cohesion: 0.13
Nodes (32): processContractorRegistrationInvite(), decryptSecret(), encryptionKey(), httpsUrl, IntegrationRow, integrationSchema, IntegrationSettings, secret (+24 more)

### Community 3 - "permissions.ts"
Cohesion: 0.20
Nodes (11): AuditData, AuditEvent, AuditPanel(), dateTime(), detailLabels, emptyFilters, auditActionLabels, isContractorManager() (+3 more)

### Community 4 - "001-initial.sql"
Cohesion: 0.07
Nodes (42): approvals, approver_assignment, approvers, audit_events, companies, contractor_units, contractors, document_versions (+34 more)

### Community 5 - "document-editor.tsx"
Cohesion: 0.09
Nodes (38): CameraCapture(), DocumentEditor(), Photo, labels, PtLifecycleControls(), create(), aprProfiles, Field (+30 more)

### Community 6 - "environment"
Cohesion: 0.06
Nodes (41): build, depends_on, environment, ports, restart, context, dockerfile, target (+33 more)

### Community 7 - "admin/route.ts"
Cohesion: 0.06
Nodes (58): @electric-sql/pglite, @electric-sql/pglite-socket, pg, client, onlineMigrations(), businessTables, cleanProductionData(), cnpjFor() (+50 more)

### Community 8 - "Nexus PTW AI"
Cohesion: 0.05
Nodes (39): Cadastro da contratada por convite — 24/11/2026, Ciclo da PT no mesmo dia — 24/11/2026, Data de emissão da PT — 24/11/2026, Decisão de arquitetura, Diretrizes adotadas, Funcionalidades disponíveis no código, Nexus PTW — implementado, Remoção da conferência manual em Pessoas e acessos — 24/11/2026 (+31 more)

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
Cohesion: 0.17
Nodes (12): dependencies, idb@^8.0.3, lucide-react@^0.468.0, next@16.4.6, pg@^8.16.3, react@19.3.1, react-dom@19.3.1, tsx@^4.23.15 (+4 more)

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
Cohesion: 0.18
Nodes (21): react, IdentityUploadSettings(), ConfigResponse, IntegrationPanel(), load(), save(), SignatureSettings(), PasswordInput() (+13 more)

### Community 25 - "notifications"
Cohesion: 0.40
Nodes (5): image, networks, restart, stop_grace_period, notifications

### Community 26 - "Communities (43 total, 16 thin omitted)"
Cohesion: 0.04
Nodes (46): Communities (56 total, 19 thin omitted), Community 0 - "HttpError", Community 10 - "compilerOptions", Community 11 - "scripts", Community 12 - "Formulário 2: PT (Permissão de Trabalho Integrada)", Community 13 - "dependencies", Community 14 - "environment", Community 15 - "x-runtime" (+38 more)

### Community 29 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 44 - "ContractorPublicRegistration.tsx"
Cohesion: 0.12
Nodes (20): metadata, Page(), ContractorTeam(), fileData(), Person, statuses, Team, ContractorPublicRegistration() (+12 more)

### Community 45 - "ContractorPublicRegistration.tsx"
Cohesion: 0.23
Nodes (14): AdminPanel(), CompanyFields(), ContractorFields(), find(), MaskedInput(), Company, companyDetails, CompanyDetails (+6 more)

### Community 46 - "define-password.tsx"
Cohesion: 0.53
Nodes (4): metadata, Page(), DefinePassword(), Login()

### Community 47 - "Atualização do OpenWA 0.24.0 para 0.32.0"
Cohesion: 0.18
Nodes (9): Atualização do OpenWA 0.24.0 para 0.32.0, Depois da atualização, Executar na VPS, O que o script faz, Se falhar, Diagnóstico da conexão WhatsApp, Erro no painel OpenWA, Publicação da correção do app (+1 more)

### Community 49 - "workspace.tsx"
Cohesion: 0.11
Nodes (22): Page(), ApprovalConfirmation(), actions, DocumentHistory(), History, Notification, NotificationPanel(), statuses (+14 more)

### Community 51 - "totpQrCode"
Cohesion: 0.53
Nodes (4): qrcode@^1.5.4, qrcode, totpQrCode(), totpUri()

### Community 52 - "Popup"
Cohesion: 0.25
Nodes (16): lucide-react, ApproverSettings(), Assignment, CompanyEditor(), ContractorEditor(), ContractorRegistrations(), DeleteRegistration(), IdentityReview() (+8 more)

## Knowledge Gaps
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RollingDeployment` connect `deploy_vps.py` to `Nexus PTW AI`, `HttpError`, `Communities (43 total, 16 thin omitted)`?**
  _High betweenness centrality (0.188) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `HttpError` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`HttpError` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.07028840921458371 - nodes in this community are weakly interconnected._
- **Why does `HttpError` connect `HttpError` to `Communities (43 total, 16 thin omitted)`, `integrations.ts`, `document-editor.tsx`, `admin/route.ts`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `apiError()` (e.g. with `God Nodes (most connected - your core abstractions)` and `Suggested Questions`) actually correct?**
  _`apiError()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `deploy_vps.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06393606393606394 - nodes in this community are weakly interconnected._
- **Why does `Suggested Questions` connect `Communities (43 total, 16 thin omitted)` to `api`, `deploy_vps.py`, `HttpError`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._