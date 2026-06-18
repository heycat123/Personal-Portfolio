# Evidence Local Production-Like Smoke

Use this workflow when you want to run the Evidence UI from localhost while exercising the real production API, production Cognito user pool, and production data.

## Recommended browser smoke

From the frontend repo:

```powershell
npm.cmd run dev:evidence:prod-like
```

Open:

```text
http://127.0.0.1:5181/evidence/login
```

Sign in with the normal production Cognito account. The local Vite server proxies `/evidence-api` to `https://forestlee.us/evidence-api`, so the browser uses a real Cognito token and the production API validates it before reading production data.

## What this does

- Runs only the frontend locally.
- Uses production Cognito configuration.
- Proxies local `/evidence-api` requests to the production Evidence API.
- Exercises the same production API, database, storage, graph, Redis, and RabbitMQ paths that production uses.

## What this does not do

- It does not copy production database credentials to the frontend repo.
- It does not put secrets or JWTs in `VITE_*` variables.
- It does not run a local backend against production databases.
- It does not deploy anything.

## Optional port

```powershell
$env:EVIDENCE_LOCAL_FRONTEND_PORT='5183'
npm.cmd run dev:evidence:prod-like
```

Open:

```text
http://127.0.0.1:5183/evidence/login
```

## Non-browser API smoke

This checks public production health without a token:

```powershell
npm.cmd run smoke:evidence:prod-api
```

If you need protected API checks without using the browser, place a temporary bearer token in the ignored file:

```text
.evidence-local/access-token.txt
```

Then rerun:

```powershell
npm.cmd run smoke:evidence:prod-api
```

Never commit `.evidence-local`, paste JWT values into PRs, or put tokens in `VITE_*` variables.
