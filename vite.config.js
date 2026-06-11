import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function readLocalBearerToken(env) {
  const directToken = env.EVIDENCE_LOCAL_API_BEARER_TOKEN || env.EVIDENCE_LOCAL_PROD_API_TOKEN || '';
  if (directToken.trim()) {
    return directToken.trim();
  }

  const tokenFile = env.EVIDENCE_LOCAL_API_BEARER_TOKEN_FILE || '.evidence-local/access-token.txt';
  const resolvedTokenFile = path.resolve(process.cwd(), tokenFile);
  if (!fs.existsSync(resolvedTokenFile)) {
    return '';
  }

  return fs.readFileSync(resolvedTokenFile, 'utf8').trim();
}

function createEvidenceProductionProxy(env) {
  const enabled = env.EVIDENCE_LOCAL_PROD_API_PROXY === 'true';
  if (!enabled) {
    return undefined;
  }

  const target = (env.EVIDENCE_LOCAL_PROD_API_ORIGIN || 'https://forestlee.us').replace(/\/$/, '');
  const bearerToken = readLocalBearerToken(env);

  if (!bearerToken) {
    console.warn(
      '[evidence-local-prod] No bearer token found. Protected production API requests will return 401. ' +
      'Set EVIDENCE_LOCAL_API_BEARER_TOKEN or write .evidence-local/access-token.txt.',
    );
  } else {
    console.info('[evidence-local-prod] Production API proxy is enabled with a local bearer token.');
  }

  return {
    target,
    changeOrigin: true,
    secure: true,
    ws: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        if (bearerToken && !req.headers.authorization) {
          proxyReq.setHeader('Authorization', `Bearer ${bearerToken}`);
        }
        proxyReq.setHeader('X-Evidence-Local-Smoke', 'true');
      });
      proxy.on('proxyReqWs', (proxyReq, req) => {
        if (bearerToken && !req.headers.authorization) {
          proxyReq.setHeader('Authorization', `Bearer ${bearerToken}`);
        }
        proxyReq.setHeader('X-Evidence-Local-Smoke', 'true');
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` (development/production) in the current directory.
  // The third parameter '' loads all env vars regardless of the VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '');
  const evidenceProductionProxy = createEvidenceProductionProxy(env);

  return {
    plugins: [react()],
    server: {
      proxy: {
        ...(evidenceProductionProxy ? { '/evidence-api': evidenceProductionProxy } : {}),
        '/api': {
          // Use 'env' instead of 'import.meta.env'
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
        }
      }
    }
  }
})
