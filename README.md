# Personal Portfolio And Evidence Frontend

This repo contains the React/Vite frontend for the public portfolio pages and the Evidence System web app at `/evidence`.

## What Is In This Repo

- `src/App.jsx`, `src/Portfolio.jsx`, `src/Projects.jsx` - public site routes.
- `src/evidence/` - Evidence System application shell, pages, auth, API client, context providers, and customer-facing components.
- `src/evidence/evidenceRoutes.jsx` - route map for the Evidence app.
- `src/evidence/services/evidenceApi.js` - browser API client for the Evidence API.
- `src/evidence/components/AxiomHelpDrawer.jsx` - page-aware product help drawer.
- `docs/` - frontend deployment, CI/CD, app architecture, and customer-help documentation.
- `.github/workflows/` - frontend CI and production deployment workflows.
- `Dockerfile.runtime` and `nginx.conf` - production static-site container and reverse proxy config.

## Local Development

Install dependencies and start Vite:

```powershell
npm ci
npm run dev
```

Useful checks:

```powershell
npm run lint
npm run build
```

The Evidence app reads Vite variables at build time. Common local values are:

```text
VITE_EVIDENCE_API_BASE_URL=http://127.0.0.1:8000
VITE_EVIDENCE_AUTH_MODE=local
```

Production normally uses:

```text
VITE_EVIDENCE_API_BASE_URL=/evidence-api
VITE_EVIDENCE_AUTH_MODE=cognito
```

Do not put backend secrets, API keys, database passwords, or private tokens in `VITE_` variables. Vite variables are shipped to the browser.

## Evidence App Routes

The Evidence app lives under `/evidence` and currently includes:

- Login and account
- Case selector, invitations, and onboarding
- Case dashboard
- Documents and document detail
- Add Documents / intake
- Query and system query
- Entities and entity detail
- Jobs and job detail
- Health
- Tests
- Settings
- Support
- Admin

See `docs/EVIDENCE_APP_ARCHITECTURE.md` for the route and page map.

## Deployment

Pull requests run frontend CI and do not deploy.

Merges to `master` deploy only when frontend runtime paths change. Docs-only changes should not rebuild or restart the production frontend container.

Start with:

- `docs/DEPLOYMENT_PROTOCOL.md`
- `docs/DEPLOYMENT.md`
- `docs/CI_CD_PIPELINE.md`

## Customer Help

Customer-facing help content is tracked in `docs/CUSTOMER_HELP_FUNCTIONALITY_GUIDE.md`. The current app has an Axiom Help drawer wired to the backend help endpoint, and that guide is the seed corpus for expanding page-aware help topics.
