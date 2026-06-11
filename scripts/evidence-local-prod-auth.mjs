import fs from 'node:fs';
import path from 'node:path';

export const defaultTokenFile = '.evidence-local/access-token.txt';

export function readLocalBearerToken(env = process.env) {
  const directToken = env.EVIDENCE_LOCAL_API_BEARER_TOKEN || env.EVIDENCE_LOCAL_PROD_API_TOKEN || '';
  if (directToken.trim()) {
    return {
      token: directToken.trim(),
      source: 'environment',
    };
  }

  const tokenFile = env.EVIDENCE_LOCAL_API_BEARER_TOKEN_FILE || defaultTokenFile;
  const resolvedTokenFile = path.resolve(process.cwd(), tokenFile);
  if (!fs.existsSync(resolvedTokenFile)) {
    return {
      token: '',
      source: resolvedTokenFile,
    };
  }

  return {
    token: fs.readFileSync(resolvedTokenFile, 'utf8').trim(),
    source: resolvedTokenFile,
  };
}

export function localSmokeEnv(env = process.env) {
  const normalizedEnv = Object.fromEntries(
    Object.entries(env)
      .filter(([key, value]) => key && value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );

  return {
    ...normalizedEnv,
    EVIDENCE_LOCAL_PROD_API_PROXY: env.EVIDENCE_LOCAL_PROD_API_PROXY || 'true',
    EVIDENCE_LOCAL_PROD_API_ORIGIN: env.EVIDENCE_LOCAL_PROD_API_ORIGIN || 'https://forestlee.us',
    VITE_EVIDENCE_API_BASE_URL: env.VITE_EVIDENCE_API_BASE_URL || '/evidence-api',
    VITE_EVIDENCE_AUTH_MODE: env.VITE_EVIDENCE_AUTH_MODE || 'local',
    VITE_EVIDENCE_ENVIRONMENT: env.VITE_EVIDENCE_ENVIRONMENT || 'Local + production API',
    VITE_EVIDENCE_SITE_VERSION: env.VITE_EVIDENCE_SITE_VERSION || 'local-prod-smoke',
  };
}
