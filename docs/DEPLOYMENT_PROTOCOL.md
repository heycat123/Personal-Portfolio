# Personal Portfolio Deployment Protocol

## Source of truth

GitHub is the source of truth for deployable frontend code. EC2 should normally receive new frontend containers only from GitHub Actions after a reviewed merge to `master`.

## Normal flow

1. Create a branch for the change.
2. Commit the local change.
3. Push the branch to GitHub.
4. Open a pull request into `master`.
5. Let Frontend CI pass.
6. Merge the pull request.
7. Let Deploy frontend run from `master`.
8. Verify `https://forestlee.us/evidence` and `https://forestlee.us/evidence-api/health`.

## Emergency SSH changes

Direct SSH edits are only for urgent repair or investigation. After any server-side hotfix, mirror the change into the repo, open a pull request, and let GitHub Actions redeploy.

## Runtime and browser config

Frontend `VITE_` variables are safe only for public browser configuration, such as API base URLs or Cognito public IDs. Do not store backend API keys, Gemini keys, database passwords, or private tokens in `VITE_` variables.

## Deployment triggers

Pull requests run CI and do not deploy.

Merges to `master` deploy only when frontend runtime files change, such as:

- `src/**`
- `package.json` or `package-lock.json`
- Docker or Nginx config
- Vite/Tailwind/PostCSS/ESLint config
- deployment workflow changes

Docs-only changes should not rebuild or restart the frontend container.
