# Evidence App Architecture

## Purpose

The Evidence app is the customer and operator web interface for the Evidence System. It lives under `/evidence` inside the `Personal-Portfolio` frontend repo and talks to the backend Evidence API through `src/evidence/services/evidenceApi.js`.

## Main Files

- `src/evidence/EvidenceApp.jsx` - top-level Evidence app wrapper.
- `src/evidence/evidenceRoutes.jsx` - protected route tree, role gates, and default redirects.
- `src/evidence/layout/EvidenceLayout.jsx` - shared app layout.
- `src/evidence/layout/EvidenceSidebar.jsx` - grouped navigation.
- `src/evidence/layout/EvidenceTopbar.jsx` - active case/account/support/help controls.
- `src/evidence/context/AuthContext.jsx` - auth state and token access.
- `src/evidence/context/CaseContext.jsx` - active case/workspace state.
- `src/evidence/context/OperatorModeContext.jsx` - support/operator-mode visibility.
- `src/evidence/context/LocaleContext.jsx` - language and timezone preferences.
- `src/evidence/context/ApiStatusContext.jsx` - API status/error monitoring.
- `src/evidence/services/evidenceApi.js` - API calls, correlation IDs, request fingerprints, JSON/blob handling.
- `src/evidence/components/AxiomHelpDrawer.jsx` - page-aware product help drawer.

## Route Map

Case route params use the API-provided `case_url_id` for public URLs. Keep backend/internal `case_id` values out of visible route construction unless an API explicitly requires them in a request payload.

| Route | Page | Audience | Purpose |
| --- | --- | --- | --- |
| `/evidence/login` | Login | All users | Sign in or reach auth-dependent flows. |
| `/evidence/account` | Account | Signed-in users | Manage account preferences and profile state. |
| `/evidence/cases` | Case Selector | Signed-in users | Choose an accessible case/workspace. |
| `/evidence/invitations` | Invitations | Signed-in users | Review and accept pending case invitations. |
| `/evidence/onboarding` | Onboarding | Signed-in users with no case or new workspace intent | Create an active case or pre-case workspace. |
| `/evidence/cases/:caseId/dashboard` | Dashboard | Case members | Start page for case readiness and common workflows. |
| `/evidence/cases/:caseId/documents` | Documents | Case members | Search, preview, inspect, and export case files. |
| `/evidence/cases/:caseId/documents/:fileId` | Document Detail | Case members | Focused view of one file. |
| `/evidence/cases/:caseId/intake` | Add Documents | Contributors and above | Upload files, connect sources, and select source files. |
| `/evidence/cases/:caseId/query` | Query | Case members | Ask questions about the case evidence. |
| `/evidence/cases/:caseId/entities` | Entities | Operators and above | Review extracted entities, aliases, relationships, and contact links. |
| `/evidence/cases/:caseId/entities/:personId` | Entity Detail | Operators and above | Focused review of one entity. |
| `/evidence/cases/:caseId/jobs` | Jobs | Operators and above | View, retry, or cancel safe background jobs. |
| `/evidence/cases/:caseId/jobs/:jobId` | Job Detail | Operators and above | Inspect job events and results. |
| `/evidence/cases/:caseId/system-query` | System Query | Operators and above | Ask operational questions about system state. |
| `/evidence/cases/:caseId/health` | Health | Operators and above | Check API, storage, graph, queue, and source-alignment health. |
| `/evidence/cases/:caseId/tests` | Tests | Operators and above | Review baseline answer tests and human decisions. |
| `/evidence/cases/:caseId/settings` | Settings | Case members/admins | View or change workspace settings. |
| `/evidence/cases/:caseId/support` | Support | Case members | Create and review support/idea records. |
| `/evidence/cases/:caseId/admin` | Admin | Admins | Manage users, memberships, and invitations. |

## API Boundary

The browser client sends Evidence API calls through `EVIDENCE_API_BASE_URL`.

Local development commonly uses:

```text
VITE_EVIDENCE_API_BASE_URL=http://127.0.0.1:8000
```

Production uses same-origin proxying:

```text
VITE_EVIDENCE_API_BASE_URL=/evidence-api
```

Nginx forwards `/evidence-api/*` to the backend Evidence API running on the EC2 Docker host.

## Auth Boundary

The frontend supports a Cognito-oriented mode and earlier local/MVP modes through `VITE_EVIDENCE_AUTH_MODE`.

Protected routes require a signed-in user. Case routes also require a selected/authorized case context. Role-gated route wrappers hide operator/admin pages from users without the required case role.

## Help Boundary

Axiom Help answers product-usage questions. It is page-aware because it sends the current route to the backend help endpoint.

Case-evidence questions should go through the Query page, not Axiom Help.

## UI Standard

Evidence UI work should follow `docs/EVIDENCE_UI_COMPONENT_STANDARD.md`. That standard defines the component baseline, visual rules, accessibility expectations, and multilingual requirements for customer-facing and operator-facing Evidence surfaces.

## Documentation Gaps

- Add screenshots or short visual checks after the UI stabilizes.
- Keep route table aligned with `src/evidence/evidenceRoutes.jsx`.
- Add role names once the backend role/access matrix is finalized.
- Connect `docs/CUSTOMER_HELP_FUNCTIONALITY_GUIDE.md` to backend help topics when implementation work resumes.
