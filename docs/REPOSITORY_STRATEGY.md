# Repository Strategy

## Current decision

Keep the frontend and backend in separate GitHub repositories for now:

- `heycat123/Personal-Portfolio`
- `heycat123/Legal-Evidence-Utlities`

Coordinate cross-repo work with one GitHub Project, shared branch naming, and matching pull request names.

## Working convention

Use the same branch name in both repos when a task spans frontend and backend:

```text
feature/deployment-pipeline
```

Use matching pull request titles:

```text
Frontend: Feature/deployment-pipeline - deployment protocol and CI gates
Backend: Feature/deployment-pipeline - deployment protocol and API hardening
```

Pull requests are the normal review gate. Merging to `master` is the production deployment signal.

## GitHub Project

Use a single project named:

```text
Evidence System
```

Project URL:

```text
https://github.com/users/heycat123/projects/1
```

Suggested project items:

- Deployment pipeline hardening
- Evidence API security hardening
- Frontend deployment protocol
- Repository split decision: product app vs desktop utilities
- Future monorepo evaluation

## Future repository split

The backend repository currently contains both the deployed Evidence API and older desktop/local evidence utilities. That is workable short term, but the long-term direction should be:

```text
Evidence-System
  apps/frontend
  apps/evidence-api
  docs
  infra

Evidence-Utilities
  desktop scripts
  PDF/SMS/WhatsApp tools
  local evidence processing utilities
```

Do not migrate immediately. First stabilize the deployment pipeline, CI checks, and PR workflow. Then split or reorganize with a dedicated migration plan.
