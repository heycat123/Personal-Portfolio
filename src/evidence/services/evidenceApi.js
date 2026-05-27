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

function emitApiError(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new CustomEvent('evidence-api-error', { detail }));
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
    emitApiError({
      message: error.message || 'Evidence API request failed.',
      path,
      status: null,
      requestFingerprintId: null,
      correlationId,
      capturedAt: new Date().toISOString(),
    });
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
    emitApiError({
      message: detail || 'Evidence API returned an error.',
      path,
      status: response.status,
      payload,
      requestFingerprintId,
      correlationId: result.correlationId,
      capturedAt: new Date().toISOString(),
    });
    throw new EvidenceApiError(detail || 'Evidence API returned an error.', {
      status: response.status,
      payload,
      requestFingerprintId,
      correlationId: result.correlationId,
    });
  }

  return result;
}

async function requestBlob(path, options = {}) {
  const {
    method = 'GET',
    query,
    token,
    signal,
  } = options;
  const correlationId = createCorrelationId();
  const headers = {
    Accept: 'application/pdf,application/octet-stream',
    'X-Correlation-ID': correlationId,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiUrl(path, query), {
      method,
      headers,
      signal,
    });
  } catch (error) {
    emitApiError({
      message: error.message || 'Evidence API request failed.',
      path,
      status: null,
      requestFingerprintId: null,
      correlationId,
      capturedAt: new Date().toISOString(),
    });
    throw new EvidenceApiError(error.message || 'Evidence API request failed.', {
      correlationId,
    });
  }

  const requestFingerprintId = response.headers.get('X-Request-Fingerprint-ID') || null;
  const result = {
    blob: response.ok ? await response.blob() : null,
    status: response.status,
    requestFingerprintId,
    correlationId: response.headers.get('X-Correlation-ID') || correlationId,
    contentType: response.headers.get('Content-Type') || null,
    fileName: response.headers.get('Content-Disposition') || null,
  };

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text ? { raw: text } : null;
    }
    const detail = payload?.detail || payload?.error_message || response.statusText;
    emitApiError({
      message: detail || 'Evidence API returned an error.',
      path,
      status: response.status,
      payload,
      requestFingerprintId,
      correlationId: result.correlationId,
      capturedAt: new Date().toISOString(),
    });
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
  updateMePreferences: (payload, options) =>
    request('/api/v1/me/preferences', { ...options, method: 'PATCH', body: payload }),
  getAdminUsers: (options) => request('/api/v1/admin/users', options),
  createAdminUser: (payload, options) =>
    request('/api/v1/admin/users', { ...options, method: 'POST', body: payload }),
  updateAdminUser: (userId, payload, options) =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}`, { ...options, method: 'PATCH', body: payload }),
  deleteAdminUser: (userId, options) =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}`, { ...options, method: 'DELETE' }),
  getAdminUserCaseMemberships: (userId, options) =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}/case-memberships`, options),
  grantCaseMembership: (userId, payload, options) =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}/case-memberships`, {
      ...options,
      method: 'POST',
      body: payload,
    }),
  revokeCaseMembership: (userId, caseId, options) =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}/case-memberships/${encodeURIComponent(caseId)}/revoke`, {
      ...options,
      method: 'POST',
    }),
  getCases: (options) => request('/api/v1/cases', options),
  createOnboardingWorkspace: (payload, options) =>
    request('/api/v1/onboarding/workspaces', { ...options, method: 'POST', body: payload }),
  previewInvitation: (inviteCode, options) =>
    request('/api/v1/invitations/preview', { ...options, query: { invite_code: inviteCode } }),
  getPendingInvitations: (options) => request('/api/v1/invitations/pending', options),
  acceptInvitation: (payload, options) =>
    request('/api/v1/invitations/accept', { ...options, method: 'POST', body: payload }),
  updateCase: (caseId, payload, options) =>
    request(casePath(caseId), { ...options, method: 'PATCH', body: payload }),
  getCaseSummary: (caseId, options) => request(casePath(caseId, '/summary'), options),
  getDocuments: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/documents'), { ...options, query: params }),
  getDocument: (caseId, fileId, options) =>
    request(casePath(caseId, `/documents/${encodeURIComponent(fileId)}`), options),
  getEntities: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/entities'), { ...options, query: params }),
  getEntity: (caseId, personId, options) =>
    request(casePath(caseId, `/entities/${encodeURIComponent(personId)}`), options),
  getEntityMergeSuggestions: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/entities/merge-suggestions'), { ...options, query: params }),
  reviewEntityAlias: (caseId, personId, payload, options) =>
    request(casePath(caseId, `/entities/${encodeURIComponent(personId)}/aliases/review`), {
      ...options,
      method: 'POST',
      body: payload,
    }),
  reassignEntityAlias: (caseId, personId, payload, options) =>
    request(casePath(caseId, `/entities/${encodeURIComponent(personId)}/aliases/reassign`), {
      ...options,
      method: 'POST',
      body: payload,
    }),
  createEntityMergeDecision: (caseId, payload, options) =>
    request(casePath(caseId, '/entities/merge-decisions'), { ...options, method: 'POST', body: payload }),
  presignDocumentUpload: (caseId, payload, options) =>
    request(casePath(caseId, '/documents/presign-upload'), { ...options, method: 'POST', body: payload }),
  registerDocumentUpload: (caseId, payload, options) =>
    request(casePath(caseId, '/documents/register-upload'), { ...options, method: 'POST', body: payload }),
  getSourceConnectors: (caseId, options) => request(casePath(caseId, '/source-connectors'), options),
  authorizeGoogleDrive: (caseId, payload, options) =>
    request(casePath(caseId, '/source-connectors/google-drive/authorize'), { ...options, method: 'POST', body: payload }),
  browseGoogleDrive: (caseId, sourceConnectionId, params = {}, options = {}) =>
    request(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/google-drive/browse`),
      { ...options, query: params },
    ),
  searchGoogleDrive: (caseId, sourceConnectionId, params = {}, options = {}) =>
    request(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/google-drive/search`),
      { ...options, query: params },
    ),
  reviewGoogleDriveNativeFiles: (caseId, sourceConnectionId, params = {}, options = {}) =>
    request(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/google-drive/review-native-files`),
      { ...options, query: params },
    ),
  previewGoogleDriveFile: (caseId, sourceConnectionId, driveFileId, options = {}) =>
    requestBlob(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/google-drive/files/${encodeURIComponent(driveFileId)}/preview`),
      options,
    ),
  importGoogleDriveFile: (caseId, sourceConnectionId, payload, options) =>
    request(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/google-drive/import-file`),
      { ...options, method: 'POST', body: payload },
    ),
  getSourceWatchItems: (caseId, sourceConnectionId, options) =>
    request(casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/watch-items`), options),
  addSourceWatchItem: (caseId, sourceConnectionId, payload, options) =>
    request(casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/watch-items`), {
      ...options,
      method: 'POST',
      body: payload,
    }),
  resolveGoogleDriveWatchItems: (caseId, sourceConnectionId, payload = {}, options) =>
    request(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/google-drive/resolve-watch-items`),
      { ...options, method: 'POST', body: payload },
    ),
  deactivateSourceWatchItem: (caseId, sourceConnectionId, sourceWatchItemId, options) =>
    request(
      casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/watch-items/${encodeURIComponent(sourceWatchItemId)}/deactivate`),
      { ...options, method: 'POST' },
    ),
  disconnectSourceConnector: (caseId, sourceConnectionId, options) =>
    request(casePath(caseId, `/source-connectors/${encodeURIComponent(sourceConnectionId)}/disconnect`), {
      ...options,
      method: 'POST',
    }),
  getCaseMemberships: (caseId, options) => request(casePath(caseId, '/memberships'), options),
  getCaseInvitations: (caseId, options) => request(casePath(caseId, '/invitations'), options),
  createCaseInvitation: (caseId, payload, options) =>
    request(casePath(caseId, '/invitations'), { ...options, method: 'POST', body: payload }),
  cancelCaseInvitation: (caseId, invitationId, options) =>
    request(casePath(caseId, `/invitations/${encodeURIComponent(invitationId)}/cancel`), {
      ...options,
      method: 'POST',
    }),
  getRawParity: (caseId, options) => request(casePath(caseId, '/raw-parity'), options),
  getCaseHealth: (caseId, options) => request(casePath(caseId, '/health'), options),
  getStorageHealth: (caseId, options) =>
    request(casePath(caseId, '/storage/health'), options),
  getGraphHealth: (caseId, options) =>
    request(casePath(caseId, '/graph/health'), options),
  getQueueHealth: (caseId, options) =>
    request(casePath(caseId, '/queue/health'), options),
  getSourceAlignmentLatest: (caseId, options) =>
    request(casePath(caseId, '/source-alignment/latest'), options),
  getQueryConversations: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/query/conversations'), { ...options, query: params }),
  createQueryConversation: (caseId, payload, options) =>
    request(casePath(caseId, '/query/conversations'), { ...options, method: 'POST', body: payload }),
  getQueryConversation: (caseId, conversationId, options) =>
    request(casePath(caseId, `/query/conversations/${encodeURIComponent(conversationId)}`), options),
  queryCase: (caseId, payload, options) =>
    request(casePath(caseId, '/query'), { ...options, method: 'POST', body: payload }),
  queryHelp: (caseId, payload, options) =>
    request(casePath(caseId, '/help/query'), { ...options, method: 'POST', body: payload }),
  createSupportRecord: (caseId, payload, options) =>
    request(casePath(caseId, '/support-records'), { ...options, method: 'POST', body: payload }),
  getSupportRecords: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/support-records'), { ...options, query: params }),
  getBaselineTests: (caseId, options) =>
    request(casePath(caseId, '/tests/baseline'), options),
  getBaselineTestRuns: (caseId, params = {}, options = {}) =>
    request(casePath(caseId, '/tests/baseline/runs'), { ...options, query: params }),
  queueBaselineTestRun: (caseId, payload, options) =>
    request(casePath(caseId, '/tests/baseline/run'), { ...options, method: 'POST', body: payload }),
  createBaselineTestReview: (caseId, payload, options) =>
    request(casePath(caseId, '/tests/baseline/reviews'), { ...options, method: 'POST', body: payload }),
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
