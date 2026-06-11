import { defaultTokenFile, readLocalBearerToken } from './evidence-local-prod-auth.mjs';

const apiOrigin = (process.env.EVIDENCE_LOCAL_PROD_API_ORIGIN || 'https://forestlee.us').replace(/\/$/, '');
const caseId = process.env.EVIDENCE_LOCAL_CASE_ID || 'case_e5f3b7b645821788';
const { token, source } = readLocalBearerToken();

function apiUrl(path) {
  return `${apiOrigin}/evidence-api${path}`;
}

async function timedFetch(label, path, options = {}) {
  const started = performance.now();
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const elapsedMs = Math.round(performance.now() - started);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { raw: text.slice(0, 500) } : null;
  }
  return {
    label,
    status: response.status,
    ok: response.ok,
    elapsedMs,
    payload,
  };
}

function assertOk(result) {
  if (!result.ok) {
    throw new Error(`${result.label} failed with HTTP ${result.status}`);
  }
}

console.log('Evidence production API smoke check');
console.log(`API origin: ${apiOrigin}`);
console.log(`Case id: ${caseId}`);
console.log(`Token source: ${token ? source : `missing (${source || defaultTokenFile})`}`);
console.log('Token values are not printed.');

const health = await timedFetch('health', '/health');
assertOk(health);
console.log(`health: HTTP ${health.status}, ${health.elapsedMs}ms, version=${health.payload?.version || 'unknown'}`);

if (!token) {
  console.log('Skipping protected checks because no bearer token is available.');
  if (process.env.EVIDENCE_LOCAL_REQUIRE_TOKEN === 'true') {
    throw new Error('Protected checks require a bearer token, but none was found.');
  }
} else {
  const me = await timedFetch('me', '/api/v1/me');
  assertOk(me);
  console.log(`me: HTTP ${me.status}, ${me.elapsedMs}ms, user=${me.payload?.email || me.payload?.user_id || 'authenticated'}`);

  const jobs = await timedFetch(
    'jobs default',
    `/api/v1/cases/${encodeURIComponent(caseId)}/jobs?limit=5`,
  );
  assertOk(jobs);
  console.log(
    `jobs default: HTTP ${jobs.status}, ${jobs.elapsedMs}ms, readinessIncluded=${jobs.payload?.document_processing_readiness_included === true}`,
  );
  if (jobs.payload?.document_processing_readiness_included === true) {
    throw new Error('Default jobs response unexpectedly includes document readiness.');
  }

  const jobsWithReadiness = await timedFetch(
    'jobs with readiness',
    `/api/v1/cases/${encodeURIComponent(caseId)}/jobs?limit=5&include_document_readiness=true`,
  );
  assertOk(jobsWithReadiness);
  console.log(
    `jobs with readiness: HTTP ${jobsWithReadiness.status}, ${jobsWithReadiness.elapsedMs}ms, readinessIncluded=${jobsWithReadiness.payload?.document_processing_readiness_included === true}`,
  );
  if (jobsWithReadiness.payload?.document_processing_readiness_included !== true) {
    throw new Error('Opt-in jobs response did not include document readiness.');
  }
}
