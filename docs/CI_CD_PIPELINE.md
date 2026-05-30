# CI/CD Pipeline

## Purpose

This document explains how the frontend CI/CD deployment pipeline works, why dependencies are installed during each run, and what can be optimized safely.

## Current pipeline summary

The frontend uses two GitHub Actions workflows:

- `Frontend CI`
- `Deploy frontend`

`Frontend CI` validates feature branches and pull requests.

`Deploy frontend` validates, builds, packages, and deploys the production frontend to EC2.

## Branch behavior

Feature branches do not deploy.

Feature branch flow:

```text
push feature branch
-> GitHub Actions runs Frontend CI
-> install dependencies
-> lint
-> build static app
-> build runtime Docker image
```

Deployment branch flow:

```text
push master
-> GitHub Actions runs Deploy frontend
-> install dependencies
-> lint
-> build static app
-> package Docker image
-> copy image to EC2
-> smoke test candidate container
-> swap live container
-> smoke test live site
-> rollback if live check fails
```

Any commit pushed to `master` triggers the deployment workflow.

## Why dependencies are installed every run

GitHub-hosted runners are temporary machines. Each workflow starts from a clean environment:

```text
new runner
-> checkout repository
-> install dependencies
-> run build/test/deploy steps
-> runner is discarded
```

The runner does not keep `node_modules` from the previous deployment.

The workflow uses:

```bash
npm ci --prefer-offline --no-audit --no-fund
```

`npm ci` is intentional for CI because it:

- installs exactly what is listed in `package-lock.json`
- fails if `package.json` and `package-lock.json` disagree
- avoids accidental dependency drift
- removes stale packages that are no longer in the lockfile
- creates a reproducible build environment

This is different from local development, where `node_modules` already exists and `npm install` can incrementally add or remove packages.

## What is already cached

The workflow uses `actions/setup-node` with npm cache enabled:

```yaml
with:
  node-version: 20
  cache: npm
```

This caches npm's package download cache.

That means the workflow should not download every dependency from the internet every time. It still has to recreate `node_modules` on the fresh runner so `npm run lint` and `npm run build` have the files they need.

## Why not only install new dependencies

"Only install new dependencies and remove deleted ones" requires persistent state from the previous run.

That can be done on a persistent/self-hosted runner, but it has tradeoffs:

- stale files can survive between builds
- undeclared dependencies can accidentally remain available
- builds can pass in CI but fail on a clean machine
- production artifacts become less reproducible

For deployment, reproducibility matters more than avoiding all install work.

## Current Docker optimization

The Docker build was changed so it no longer rebuilds the React app inside Docker.

Previous Docker flow:

```text
GitHub Actions npm ci
GitHub Actions npm run build
Docker build npm ci again
Docker build npm run build again
Nginx serves dist
```

Current Docker flow:

```text
GitHub Actions npm ci
GitHub Actions npm run build
Docker build copies existing dist
Nginx serves dist
```

The runtime image is built with:

```text
Dockerfile.runtime
```

That file only packages:

- `nginx.conf`
- `dist/`

This keeps the deployment image small and makes the Docker build step much faster.

## Production deployment details

The production workflow builds an image tagged with the Git commit SHA:

```text
hom-central-frontend:<GITHUB_SHA>
```

It exports that image:

```text
hom-central-frontend-<GITHUB_SHA>.tar.gz
```

Then it copies the archive to EC2 and loads it with Docker.

Before replacing production, the workflow starts a candidate container on:

```text
127.0.0.1:18081
```

Candidate smoke checks:

```text
/
/projects
/evidence
/evidence-api/health
```

If those pass, the workflow replaces the live container:

```text
container: hom-central-ui
EC2-local smoke port: 127.0.0.1:18080
published through host/proxy for the live site
```

After the swap, it smoke tests the live site.

If the live check fails, it attempts to restore the previous container.

The frontend container is started with `--add-host=host.docker.internal:host-gateway` so Nginx can proxy `/evidence-api/*` to the Evidence API running on the EC2 Docker host at port `8000`.

## Safe future optimizations

Recommended options:

- Skip full deployment for docs-only changes using path filters.
- Keep `npm ci`, but tune npm cache and dependency size.
- Move to `pnpm` for a faster content-addressed dependency store.
- Use a self-hosted runner only if we accept the operational responsibility and add cleanup safeguards.
- Add a staging deployment workflow for branch previews if HTTPS-auth testing becomes necessary.

Riskier options:

- Cache `node_modules` directly.
- Use `npm install` instead of `npm ci` in CI.
- Reuse a persistent workspace without a clean install.

These can be faster, but they reduce build reproducibility and make dependency-related bugs harder to detect.

## Practical recommendation

Keep `npm ci` for production deployment.

The current bottleneck is now dependency installation, not Docker packaging. If deployment speed becomes a larger problem, the next best change is to skip deployment for non-runtime changes such as documentation-only commits.
