# Frontend Deployment Guide

For the broader CI/CD pipeline explanation, including dependency installation behavior and Docker packaging optimization, see `docs/CI_CD_PIPELINE.md`.

## Purpose

This document captures the deployment flow for the React/Vite frontend on EC2 and answers:  
- How to test a feature branch  
- When HTTPS and JWT matter in local/staging testing  
- Whether merging to main/master auto-deploys

## 1) Branch workflow

### Recommended branch strategy

- `feature/...`: development and code review
- `master` (or `main`): deployment branch
- Pull requests from feature branches should run CI only
- Deployment should happen only from the deployment branch

### What runs where

1. Push/PR to feature branch: `Frontend CI` workflow runs  
   - `npm ci`  
   - `npm run lint`  
   - `npm run build`  
   - `docker build` (or equivalent image validation)
2. Merge/Push to deployment branch (`main` or `master`): `deploy-frontend` workflow runs and deploys to EC2.
3. Manual deployment: possible by clicking `workflow_dispatch` in GitHub Actions.

## 2) Feature-branch testing (without deployment)

Yes, test feature branches locally.

### Local frontend checks

Run your normal local checks on the branch:
- `npm ci`
- `npm run lint`
- `npm run build`
- Manual browser checks (home, deep links, API-driven pages)

### HTTPS limitation

Some parts may require HTTPS and/or secure-origin behavior (auth cookies, OAuth/OIDC, some browsers' auth restrictions). If your current flow requires that:
- Use the frontend dev server with HTTPS if practical
- Or test these flows in a staging environment that is HTTPS-enabled

If local HTTPS is required, you can:
- run frontend with a local cert setup
- or use a local tunnel/hostname that serves HTTPS during testing

### JWT/API access

If an endpoint requires JWT:
- You must use a valid token for those calls.
- You can obtain it through the normal login flow and copy it for manual API checks.
- Include it as:
  - `Authorization: Bearer <token>`
  - In browser, keep it in the normal app auth state/session.

Without a valid JWT, protected endpoints will return auth failures even when deployment mechanics are correct.

### Test API URL selection

Use environment-aware API URLs:
- Local API: `VITE_EVIDENCE_API_BASE_URL=http://127.0.0.1:8000`
- Production/staging: `VITE_EVIDENCE_API_BASE_URL=/evidence-api`
- Temporary Phase 7.3 MVP auth: `VITE_EVIDENCE_AUTH_MODE=local`
- Future Cognito auth: `VITE_EVIDENCE_AUTH_MODE=cognito`

If deploy-time API variables are not set, defaults in the workflow/docs are used.

## 3) What happens on merge to main/master

If your workflow is configured with `on: push: branches: [ main, master ]` (or just your deployment branch), then **merging into that branch automatically triggers deployment**.

Expected pipeline:

```text
feature branch push -> PR -> merge to deployment branch -> GitHub Actions deploy -> EC2 candidate verify -> swap -> smoke checks -> keep new container or rollback
```

If this is not happening, confirm:
- The workflow is on the deployment branch (`main`/`master`) and is enabled.
- The commit was merged into that exact branch.
- Required GitHub secrets/variables are set.

## 4) EC2 deployment flow

The deploy workflow uses a candidate-first process:

1. Build image
2. Copy image to EC2
3. Start temporary candidate container on `127.0.0.1:18080`
4. Smoke test candidate:
   - `GET /`
   - `GET /projects`
   - `GET /evidence`
   - `GET /evidence-api/health`
5. If candidate passes: stop old container, swap in new `hom-central-ui` on `80:80`
6. Smoke test live URLs:
   - `GET /`
   - `GET /projects`
   - `GET /evidence`
   - `GET /evidence-api/health`
7. On live failure: rollback to previous container

## 5) Required repository settings

Set in GitHub Secrets:

```text
EC2_HOST=ec2-18-222-93-147.us-east-2.compute.amazonaws.com
EC2_USER=ec2-user
EC2_SSH_PRIVATE_KEY=<PEM private key contents>
```

Set in GitHub Variables (optional override):

```text
VITE_API_URL=http://18.222.93.147:3000
VITE_EVIDENCE_API_BASE_URL=/evidence-api
VITE_EVIDENCE_AUTH_MODE=local
```

For Cognito deployment, use the current SPA user pool/client:

```text
VITE_EVIDENCE_AUTH_MODE=cognito
VITE_AWS_REGION=us-east-2
VITE_COGNITO_USER_POOL_ID=us-east-2_SfO4Yq5qb
VITE_COGNITO_USER_POOL_CLIENT_ID=46hn6m1uviifa47b3ogrhg7lg8
```

The matching Cognito app client callback and logout URLs are:

```text
https://forestlee.us/evidence/login
http://localhost:5173/evidence/login
```

AWS's Hosted UI SPA sample uses:

```text
npm install oidc-client-ts react-oidc-context --save
```

with:

```text
authority=https://cognito-idp.us-east-2.amazonaws.com/us-east-2_SfO4Yq5qb
client_id=46hn6m1uviifa47b3ogrhg7lg8
redirect_uri=https://forestlee.us/evidence/login
response_type=code
scope=openid email
```

The current frontend implementation uses Amplify direct user-pool APIs. Switching to Hosted UI is a contained auth-provider change, but sign-out redirect also needs the Cognito hosted UI domain.

Do not commit `.pem` files.

## 6) Deployment targets and runtime config

Current expected runtime naming:

```text
image: hom-central-frontend
container: hom-central-ui
listen port: 80
```

Nginx must include SPA fallback:

```nginx
try_files $uri $uri/ /index.html;
```

This is required so hard refresh on `/projects` and `/evidence` does not 404.

Nginx also proxies browser Evidence API calls through the same origin:

```nginx
location /evidence-api/ {
    proxy_pass http://host.docker.internal:8000/;
}
```

The deploy workflow starts the frontend container with:

```bash
--add-host=host.docker.internal:host-gateway
```

That lets the Nginx container reach the Evidence API published on the EC2 Docker host at port `8000`.

`VITE_EVIDENCE_AUTH_MODE=local` is only a temporary MVP setting while Cognito/JWT enforcement is unfinished. Once Cognito is configured, set the GitHub variable to:

```text
VITE_EVIDENCE_AUTH_MODE=cognito
```

## 7) Fast incident checks

If users report `404` on deep links (for example `/projects`):
1. Verify latest container is actually running on EC2 and matches the latest deployment hash.
2. Verify Nginx config includes the SPA fallback.
3. Verify health checks pass for `/` `/projects` `/evidence`.
4. Confirm the deploy workflow did not roll back.

## 8) Git commands that trigger deployment

Yes. Any commit pushed to the deployment branch triggers deployment (for example `master`).

Use this to deploy by merging a feature branch into the deployment branch:

```bash
git switch master
git pull origin master
git merge --no-ff feature/legal-evidence-classification
git push origin master
```

That final `git push` is the event that GitHub Actions uses as the trigger.

If you want to run a deployment with a commit directly on the deployment branch:

```bash
git switch master
git add .
git commit -m "chore: trigger deployment"
git push origin master
```
