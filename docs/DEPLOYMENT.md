# Frontend Deployment

The frontend deploys as a Dockerized Vite/React app served by Nginx.

Production deployments should be made from Git, not by copying built files to EC2.

## Deployment Trigger

The workflow is:

```text
commit -> push to master -> GitHub Actions -> lint -> build -> Docker build -> EC2 candidate smoke -> live swap
```

The workflow also supports manual runs from GitHub Actions with `workflow_dispatch`.

Feature branches and pull requests run `Frontend CI` only:

```text
npm ci -> lint -> build -> Docker build
```

They do not deploy.

## Required GitHub Secrets

Set these in:

```text
GitHub repository -> Settings -> Secrets and variables -> Actions -> Secrets
```

Required:

```text
EC2_HOST=ec2-18-222-93-147.us-east-2.compute.amazonaws.com
EC2_USER=ec2-user
EC2_SSH_PRIVATE_KEY=<contents of the private SSH key PEM file>
```

Do not commit the PEM file.

## Optional GitHub Variables

Set these in:

```text
GitHub repository -> Settings -> Secrets and variables -> Actions -> Variables
```

Optional:

```text
VITE_API_URL=http://18.222.93.147:3000
VITE_EVIDENCE_API_BASE_URL=/evidence-api
```

If omitted, the workflow uses those same defaults.

Local development can still use:

```text
VITE_EVIDENCE_API_BASE_URL=http://127.0.0.1:8000
```

## What The Workflow Verifies

Before deployment:

```text
npm ci
npm run lint
npm run build
docker build
```

On EC2 before touching the live container:

```text
docker run candidate on 127.0.0.1:18080
curl /
curl /projects
curl /evidence
```

Only after the candidate passes does the workflow stop and replace the live container on port `80`.

After the live swap:

```text
curl /
curl /projects
curl /evidence
```

If the live smoke test fails, the workflow rolls back to the previous `hom-central-ui` container.

## Current EC2 Container Names

The frontend deployment expects:

```text
image: hom-central-frontend
container: hom-central-ui
port: 80:80
```

The deployed Nginx config includes an SPA fallback:

```nginx
try_files $uri $uri/ /index.html;
```

This is required so direct browser loads such as `/projects` and `/evidence` work.
