import { EVIDENCE_API_BASE_URL } from '../evidenceConfig';

export class EvidenceApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'EvidenceApiError';
    this.status = details.status;
    this.payload = details.payload;
    this.requestFingerprintId = details.requestFingerprintId;
    this.correlationId = details.correlationId;
  }
}

function createCorrelationId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `corr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function apiUrl(path, query) {
  const base = EVIDENCE_API_BASE_URL || '';
  const url = base.startsWith('http')
    ? new URL(`${base}${path}`)
    : new URL(`${base}${path}`, window.location.origin);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    token,
    signal,
  } = options;
  const correlationId = createCorrelationId();
  const headers = {
    Accept: 'application/json',
    'X-Correlation-ID': correlationId,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new EvidenceApiError(error.message || 'Evidence API request failed.', {
      correlationId,
    });
  }

  const payload = await parseResponse(response);
  const requestFingerprintId =
    response.headers.get('X-Request-Fingerprint-ID') ||
    payload?.request_fingerprint_id ||
    payload?.requestFingerprintId ||
    null;

  const result = {
    data: payload,
    status: response.status,
    requestFingerprintId,
    correlationId: response.headers.get('X-Correlation-ID') || correlationId,
  };

  if (!response.ok) {
    const detail = payload?.detail || payload?.error_message || response.statusText;
    throw new EvidenceApiError(detail || 'Evidence API returned an error.', {
      status: response.status,
      payload,
      requestFingerprintId,
      correlationId: result.correlationId,
    });
  }

  return result;
}

function casePath(caseId, suffix = '') {
  return `/api/v1/cases/${encodeURIComponent(caseId)}${suffix}`;
}

export const evidenceApi = {
  getHealth: (options) => request('/health', options),
  getMe: (options) => request('/api/v1/me', options),
  getCases: (options) => request('/api/v1/cases', options),
  getCaseSummary: (caseId, options) => request(casePath(caseId, '/summary'), options),
  getDocuments: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/documents'), { ...options, query: params }),
  getDocument: (caseId, fileId, options) =>
    request(casePath(caseId, `/documents/${encodeURIComponent(fileId)}`), options),
  getRawParity: (caseId, options) => request(casePath(caseId, '/raw-parity'), options),
  getCaseHealth: (caseId, options) => request(casePath(caseId, '/health'), options),
  getStorageHealth: (caseId, options) =>
    request(casePath(caseId, '/storage/health'), options),
  runStorageSmoke: (caseId, options) =>
    request(casePath(caseId, '/storage/smoke'), { ...options, method: 'POST' }),
  getJobs: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/jobs'), { ...options, query: params }),
  getJob: (caseId, jobId, options) =>
    request(casePath(caseId, `/jobs/${encodeURIComponent(jobId)}`), options),
  createJob: (caseId, payload, options) =>
    request(casePath(caseId, '/jobs'), { ...options, method: 'POST', body: payload }),
  cancelJob: (caseId, jobId, options) =>
    request(casePath(caseId, `/jobs/${encodeURIComponent(jobId)}/cancel`), { ...options, method: 'POST' }),
  retryJob: (caseId, jobId, options) =>
    request(casePath(caseId, `/jobs/${encodeURIComponent(jobId)}/retry`), { ...options, method: 'POST' }),
};
