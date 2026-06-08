import { humanizeKey } from './formatters';

const ACTIVE_STATUSES = new Set(['queued', 'running', 'cancelling']);
const TERMINAL_SUCCESS = new Set(['succeeded', 'success', 'completed']);
const TERMINAL_ATTENTION = new Set(['failed', 'cancelled', 'canceled']);
const DOCUMENT_PROCESSING_TOTAL_STEPS = 5;
const ESTIMATED_PROGRESS_CAP = 90;
const ESTIMATED_QUEUE_CAP = 12;
const DEFAULT_EXPECTED_SECONDS = 180;
const JOB_EXPECTED_SECONDS = {
  noop: 12,
  s3_storage_smoke: 75,
  source_alignment_audit: 600,
  agentic_quality_test: 900,
  document_remove_plan: 150,
  document_upload_register: 240,
};

function isLegacyDocumentProcessingRequest(job) {
  return job?.job_type === 'document_processing_request';
}

export function isDocumentTextSearchProcessing(job) {
  return job?.job_type === 'document_text_search_processing';
}

export function isDocumentProcessingRequest(job) {
  return isLegacyDocumentProcessingRequest(job) || isDocumentTextSearchProcessing(job);
}

function resultPayload(job) {
  return job?.result_json || job?.result || {};
}

function inputPayload(job) {
  return job?.input_json || job?.input || {};
}

function displayWrapper(job) {
  return job?.display || job?.display_contract || {};
}

function resolutionPayload(job, result, display) {
  return job?.resolution
    || display?.resolution
    || result?.resolution
    || result?.readiness_resolution
    || result?.document_processing_readiness?.resolution
    || {};
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || null;
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || null;
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || null;
}

function firstNumber(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '' && Number.isFinite(Number(candidate)));
  return value === undefined ? null : Number(value);
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function parseTime(value) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedSeconds(job) {
  const startedAt = parseTime(job?.started_at || job?.claimed_at || job?.created_at);
  if (!startedAt) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function expectedSeconds(job) {
  const input = inputPayload(job);
  const result = resultPayload(job);
  const explicit = firstNumber(
    job?.estimated_seconds,
    result.estimated_seconds,
    input.estimated_seconds,
    result.expected_seconds,
    input.expected_seconds,
  );
  if (explicit && explicit > 0) {
    return explicit;
  }
  return JOB_EXPECTED_SECONDS[job?.job_type] || DEFAULT_EXPECTED_SECONDS;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) {
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const extraMinutes = minutes % 60;
  return extraMinutes ? `${hours}h ${extraMinutes}m` : `${hours}h`;
}

function userFacingProcessingText(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replace(/run\s+operator\s+processing/gi, 'complete text and search processing')
    .replace(/run\s+the\s+operator\s+processing\s+pipeline/gi, 'complete text and search processing')
    .replace(/operator\s+processing\s+run/gi, 'text and search processing')
    .replace(/operator\s+processing\s+required/gi, 'text and search processing still needed')
    .replace(/operator\s+required/gi, 'support processing needed')
    .replace(/processing\s+request\s+recorded/gi, 'Processing started')
    .replace(/request\s+recorded/gi, 'Processing started');
}

function actionText(value) {
  if (typeof value === 'string') {
    return userFacingProcessingText(value);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  return userFacingProcessingText(firstString(value.label, value.action_label, value.title, value.user_message, value.message));
}

function requestRecorded(job, status, result) {
  return isLegacyDocumentProcessingRequest(job) && (
    TERMINAL_SUCCESS.has(status)
    || Boolean(result?.ok)
    || result?.workflow_status === 'request_recorded_operator_required'
    || job?.workflow_status === 'request_recorded_operator_required'
  );
}

export function jobDisplayTitle(job) {
  if (isDocumentTextSearchProcessing(job)) {
    return 'Text/search processing';
  }
  if (isLegacyDocumentProcessingRequest(job)) {
    return 'Processing start record';
  }
  return humanizeKey(job?.job_type || 'Job');
}

export function jobProcessingDocuments(job) {
  const input = inputPayload(job);
  const result = resultPayload(job);
  const nestedInput = result?.input_json || {};
  const sources = [
    result.documents,
    job?.documents,
    nestedInput.sampled_documents,
    result.sampled_documents,
    input.sampled_documents,
  ];
  return sources.find((value) => Array.isArray(value) && value.length) || [];
}

export function jobProcessingRequestedCount(job) {
  const input = inputPayload(job);
  const result = resultPayload(job);
  const nestedInput = result?.input_json || {};
  const value = Number(
    result.requested_document_count
    || input.requested_document_count
    || nestedInput.requested_document_count
    || jobProcessingDocuments(job).length
    || 0,
  );
  return Number.isFinite(value) ? value : 0;
}

export function jobProcessingUniqueHashCount(job) {
  const hashes = new Set(
    jobProcessingDocuments(job)
      .map((document) => document?.content_hash || document?.file_hash || document?.hash)
      .filter(Boolean),
  );
  return hashes.size;
}

export function jobProcessingDocumentName(document) {
  return document?.original_filename
    || document?.filename
    || document?.file_name
    || document?.name
    || document?.file_id
    || 'Source file';
}

export function jobProcessingDocumentStatus(document) {
  const rawStatus = String(document?.status || 'waiting').toLowerCase();
  const labels = {
    waiting: 'Waiting',
    queued: 'Waiting',
    reading_text: 'Reading text',
    running_ocr: 'Running OCR',
    writing_search_records: 'Indexing for search',
    processed: 'Search step complete',
    needs_ocr: 'Needs OCR/review',
    unsupported_type: 'Needs review',
    empty_text: 'Needs review',
    dependency_missing: 'Needs setup',
    missing_hash: 'Needs review',
    failed: 'Needs attention',
    cancelled: 'Cancelled',
    excluded_from_case: 'Excluded from processing',
    workspace_copy_deleted: 'Workspace copy deleted',
  };
  const badgeStatuses = {
    waiting: 'pending',
    queued: 'pending',
    reading_text: 'running',
    running_ocr: 'running',
    writing_search_records: 'running',
    processed: 'succeeded',
    needs_ocr: 'pending',
    unsupported_type: 'pending',
    empty_text: 'pending',
    dependency_missing: 'pending',
    missing_hash: 'pending',
    failed: 'failed',
    cancelled: 'degraded',
    excluded_from_case: 'unknown',
    workspace_copy_deleted: 'unknown',
  };
  return {
    rawStatus,
    label: labels[rawStatus] || humanizeKey(rawStatus),
    badgeStatus: badgeStatuses[rawStatus] || 'unknown',
    message: userFacingProcessingText(document?.message || 'Waiting for text/search processing.'),
    progressPercent: clampPercent(document?.progress_percent) ?? documentProgressFallback(rawStatus),
  };
}

function documentProgressFallback(rawStatus) {
  if (rawStatus === 'reading_text') {
    return 35;
  }
  if (rawStatus === 'running_ocr') {
    return 45;
  }
  if (rawStatus === 'writing_search_records') {
    return 75;
  }
  if ([
    'processed',
    'needs_ocr',
    'unsupported_type',
    'empty_text',
    'dependency_missing',
    'missing_hash',
    'failed',
    'cancelled',
    'canceled',
    'excluded_from_case',
    'workspace_copy_deleted',
  ].includes(rawStatus)) {
    return 100;
  }
  return 0;
}

function documentProgressSummary(job) {
  if (!isDocumentProcessingRequest(job)) {
    return null;
  }
  const documents = jobProcessingDocuments(job);
  if (!documents.length) {
    return null;
  }
  const statuses = documents.map(jobProcessingDocumentStatus);
  const progressPercent = clampPercent(statuses.reduce((sum, status) => sum + status.progressPercent, 0) / statuses.length);
  const needsAttention = statuses.filter((status) => ['failed', 'degraded'].includes(status.badgeStatus)).length;
  const needsReview = statuses.filter((status) => status.badgeStatus === 'pending' && status.progressPercent === 100).length;
  const running = statuses.filter((status) => status.badgeStatus === 'running').length;
  const ready = statuses.filter((status) => status.rawStatus === 'processed').length;
  const waiting = statuses.filter((status) => ['waiting', 'queued'].includes(status.rawStatus)).length;

  let label = 'Processing documents';
  let badgeStatus = running ? 'running' : 'pending';
  let currentStep = 'Preparing documents';

  if (needsAttention) {
    label = 'Needs attention';
    badgeStatus = 'failed';
    currentStep = 'Review processing details';
  } else if (needsReview) {
    label = 'Needs review';
    badgeStatus = 'pending';
    currentStep = 'Review files that need another extractor';
  } else if (ready === statuses.length) {
    label = 'Search step complete';
    badgeStatus = 'succeeded';
    currentStep = 'Text/search step complete';
  } else if (running) {
    currentStep = statuses.find((status) => status.badgeStatus === 'running')?.label || 'Processing documents';
  } else if (waiting) {
    label = 'Waiting to start';
    currentStep = 'Waiting to start processing';
  }

  return {
    progressPercent: progressPercent ?? 0,
    statusLabel: label,
    badgeStatus,
    currentStep,
    progressText: currentStep,
  };
}

export function jobCostSummary(job) {
  const result = resultPayload(job);
  const display = displayWrapper(job);
  const input = inputPayload(job);
  const source = firstObject(
    job?.cost_summary,
    display.cost_summary,
    result.cost_summary,
    result.cost,
    job?.actual_cost_json,
    job?.cost_estimate_json,
    input.cost_summary,
    input.cost,
  ) || {};
  const actualUsd = firstNumber(
    source.actual_usd,
    source.total_actual_usd,
    source.actual_cost_usd,
    source.cost_usd,
    source.amount_usd,
  );
  const estimatedUsd = firstNumber(
    source.estimated_usd,
    source.estimated_cost_usd,
    source.total_estimated_usd,
    source.estimate_usd,
  );
  const hasRecordedCost = Boolean(source.has_recorded_cost) || actualUsd !== null || estimatedUsd !== null;
  const paidModelRequested = Boolean(source.paid_model_requested || source.paid_model_called || source.paid || source.uses_paid_model);
  const positiveCost = [actualUsd, estimatedUsd].some((value) => value !== null && Number(value) > 0);
  const hasPaidCost = paidModelRequested || positiveCost;
  const currency = firstString(source.currency, source.currency_code) || 'USD';
  const sourceMessage = userFacingProcessingText(firstString(source.message, source.display_message));

  return {
    actualUsd,
    estimatedUsd,
    currency,
    paidModelRequested,
    hasPaidCost,
    hasRecordedCost,
    rootAdminOnly: source.root_admin_only !== false,
    message: hasPaidCost
      ? (sourceMessage || 'Cost recorded for this job.')
      : 'No paid cost recorded for this job.',
  };
}

function fallbackPercent(status) {
  if (status === 'queued') {
    return 0;
  }
  if (status === 'running' || status === 'cancelling') {
    return 15;
  }
  if (TERMINAL_SUCCESS.has(status)) {
    return 100;
  }
  return 0;
}

function estimatedActiveProgress(job, status, backendPercent, documentSummary) {
  if (!ACTIVE_STATUSES.has(status) || documentSummary || isDocumentProcessingRequest(job)) {
    return null;
  }

  const elapsed = elapsedSeconds(job);
  if (elapsed === null) {
    return null;
  }

  const expected = expectedSeconds(job);
  const elapsedLabel = formatDuration(elapsed);

  if (status === 'queued') {
    const queuedPercent = Math.min(ESTIMATED_QUEUE_CAP, Math.max(0, Math.round((elapsed / Math.max(expected, 1)) * ESTIMATED_QUEUE_CAP)));
    return {
      progressPercent: Math.max(backendPercent ?? 0, queuedPercent),
      progressEstimated: true,
      progressPercentLabel: `~${Math.max(backendPercent ?? 0, queuedPercent)}%`,
      progressEstimateDetail: `Estimated from elapsed time. Waiting for a worker; ${elapsedLabel} elapsed.`,
    };
  }

  const runningBase = Math.round(15 + Math.min(75, (elapsed / Math.max(expected, 1)) * 75));
  const progressPercent = Math.min(ESTIMATED_PROGRESS_CAP, Math.max(backendPercent ?? 0, runningBase));
  const remaining = Math.max(0, expected - elapsed);
  const progressEstimateDetail = remaining > 0
    ? `Estimated from elapsed time. About ${formatDuration(remaining)} remaining if this run follows recent timing.`
    : 'Estimated from elapsed time. This is taking longer than usual; waiting for the next worker checkpoint.';

  return {
    progressPercent,
    progressEstimated: true,
    progressPercentLabel: `~${progressPercent}%`,
    progressEstimateDetail,
  };
}

function fallbackStatusLabel(status) {
  if (status === 'queued') {
    return 'Queued';
  }
  if (status === 'running') {
    return 'Running';
  }
  if (status === 'cancelling') {
    return 'Cancel requested';
  }
  if (TERMINAL_SUCCESS.has(status)) {
    return 'Finished';
  }
  if (TERMINAL_ATTENTION.has(status)) {
    return status === 'cancelled' || status === 'canceled' ? 'Cancelled' : 'Needs attention';
  }
  return humanizeKey(status || 'unknown');
}

function fallbackBadgeStatus(status) {
  if (status === 'queued') {
    return 'queued';
  }
  if (status === 'running') {
    return 'running';
  }
  if (status === 'cancelling') {
    return 'pending';
  }
  if (TERMINAL_SUCCESS.has(status)) {
    return 'succeeded';
  }
  if (TERMINAL_ATTENTION.has(status)) {
    return status === 'failed' ? 'failed' : 'degraded';
  }
  return 'unknown';
}

function fallbackCurrentStep(status) {
  if (status === 'queued') {
    return 'Waiting to start';
  }
  if (status === 'running') {
    return 'In progress';
  }
  if (status === 'cancelling') {
    return 'Cancel requested';
  }
  if (TERMINAL_SUCCESS.has(status)) {
    return 'Finished';
  }
  if (TERMINAL_ATTENTION.has(status)) {
    return status === 'failed' ? 'Needs review' : 'Cancelled';
  }
  return 'Status unknown';
}

function normalizeBackendSteps(steps) {
  if (!steps?.length) {
    return null;
  }
  return steps.map((step, index) => ({
    key: step.key || step.id || `step_${index}`,
    label: userFacingProcessingText(firstString(step.label, step.title, step.name) || `Step ${index + 1}`),
    state: step.state || (step.complete || step.completed ? 'complete' : step.current ? 'current' : 'pending'),
  }));
}

function fallbackSteps(status) {
  if (status === 'queued') {
    return [
      { key: 'queued', label: 'Request queued', state: 'current' },
      { key: 'running', label: 'Running', state: 'pending' },
      { key: 'finished', label: 'Finished', state: 'pending' },
    ];
  }
  if (status === 'running' || status === 'cancelling') {
    return [
      { key: 'queued', label: 'Request queued', state: 'complete' },
      { key: 'running', label: status === 'cancelling' ? 'Cancel requested' : 'Running', state: 'current' },
      { key: 'finished', label: 'Finished', state: 'pending' },
    ];
  }
  if (TERMINAL_SUCCESS.has(status)) {
    return [
      { key: 'queued', label: 'Request queued', state: 'complete' },
      { key: 'running', label: 'Running', state: 'complete' },
      { key: 'finished', label: 'Finished', state: 'complete' },
    ];
  }
  if (TERMINAL_ATTENTION.has(status)) {
    return [
      { key: 'queued', label: 'Request queued', state: 'complete' },
      { key: 'running', label: status === 'failed' ? 'Needs review' : 'Cancelled', state: 'blocked' },
      { key: 'finished', label: 'Finished', state: 'pending' },
    ];
  }
  return [];
}

function documentProcessingFallbackSteps(recorded, failed) {
  return [
    {
      key: 'started',
      label: 'Processing started',
      state: failed ? 'blocked' : recorded ? 'complete' : 'current',
    },
    {
      key: 'processing',
      label: 'Text and search processing',
      state: failed ? 'blocked' : recorded ? 'current' : 'pending',
    },
    {
      key: 'text',
      label: 'Reading text',
      state: 'pending',
    },
    {
      key: 'search',
      label: 'Indexing for search',
      state: 'pending',
    },
    {
      key: 'citations',
      label: 'Source citations ready',
      state: 'pending',
    },
  ];
}

export function jobProgressModel(job) {
  const status = String(job?.status || 'unknown').toLowerCase();
  const result = resultPayload(job);
  const input = inputPayload(job);
  const display = displayWrapper(job);
  const userJobStatus = job?.user_job_status || {};
  const userStatus = String(userJobStatus.user_status || job?.user_status || '').toLowerCase();
  const resolution = resolutionPayload(job, result, display);
  const recorded = requestRecorded(job, status, result);
  const documentSummary = documentProgressSummary(job);
  const failed = TERMINAL_ATTENTION.has(status);
  const cancelRequested = Boolean(job?.cancel_requested || result.cancel_requested || display.cancel_requested);
  const fullPropagationStatus = String(firstString(
    job?.full_propagation_status,
    result.full_propagation_status,
    display.full_propagation_status,
  ) || '').toLowerCase();
  const fullPropagationComplete = [
    'complete',
    'completed',
    'ready',
    'full_propagation_complete',
    'relationship_map_complete',
    'source_propagation_complete',
  ].includes(fullPropagationStatus);
  const propagationNeedsSupport = isDocumentTextSearchProcessing(job)
    && TERMINAL_SUCCESS.has(status)
    && ['relationship_map_worker_unavailable', 'failed', 'error', 'blocked', 'needs_attention'].includes(fullPropagationStatus);
  const propagationContinues = isDocumentTextSearchProcessing(job)
    && TERMINAL_SUCCESS.has(status)
    && !propagationNeedsSupport
    && (
      ['relationship_map_queued', 'relationship_map_reused'].includes(fullPropagationStatus)
      || !fullPropagationComplete
    );
  const propagationContinuationMessage = propagationContinues
    ? fullPropagationStatus
      ? 'Search step complete. Processing continues through relationship-map and source propagation.'
      : 'Search step complete. Waiting for full document propagation to finish.'
    : propagationNeedsSupport
      ? 'Search step complete, but relationship-map propagation still needs support before full propagation is ready.'
      : null;

  const backendPercent = clampPercent(firstNumber(
    job?.progress_percent,
    result.progress_percent,
    display.progress_percent,
    resolution.progress_percent,
  ));
  const backendLooksGeneric = ACTIVE_STATUSES.has(status)
    && !documentSummary
    && !isDocumentProcessingRequest(job)
    && (backendPercent === null || backendPercent === 0 || backendPercent === 50);
  const estimatedProgress = backendLooksGeneric
    ? estimatedActiveProgress(job, status, backendPercent, documentSummary)
    : null;
  const baseProgressPercent = documentSummary?.progressPercent
    ?? estimatedProgress?.progressPercent
    ?? backendPercent
    ?? (isDocumentProcessingRequest(job) && recorded ? 0 : fallbackPercent(status));
  const progressPercent = propagationContinues ? Math.min(baseProgressPercent ?? 90, 90) : baseProgressPercent;
  const progressEstimated = Boolean(estimatedProgress);
  const progressPercentLabel = estimatedProgress?.progressPercentLabel || `${progressPercent}%`;
  const displayStatusLabel = userFacingProcessingText(firstString(
    propagationContinues ? 'Processing' : null,
    propagationNeedsSupport ? 'Ready with review needed' : null,
    userJobStatus.display_label,
    userJobStatus.status_label,
    job?.display_status,
    display.display_status,
    display.status_label,
    result.display_status,
    result.status_label,
    cancelRequested ? 'Cancel requested' : null,
    documentSummary?.statusLabel,
    isDocumentProcessingRequest(job) && recorded ? 'Processing started' : null,
    fallbackStatusLabel(status),
  ));
  const currentStep = userFacingProcessingText(firstString(
    propagationContinues ? 'Relationship-map and source propagation' : null,
    propagationNeedsSupport ? 'Relationship-map propagation needs support' : null,
    userJobStatus.stage_label,
    userJobStatus.current_step,
    job?.current_step,
    result.current_step,
    display.current_step,
    resolution.current_step,
    documentSummary?.currentStep,
    isDocumentProcessingRequest(job) && recorded ? 'Text and search processing still needed' : null,
    fallbackCurrentStep(cancelRequested ? 'cancelling' : status),
  ));
  const progressText = userFacingProcessingText(firstString(
    propagationContinuationMessage,
    userJobStatus.user_message,
    userJobStatus.message,
    job?.progress_text,
    result.progress_text,
    display.progress_text,
    documentSummary?.progressText,
    currentStep,
  ));
  const backendSteps = normalizeBackendSteps(firstArray(
    job?.workflow_steps,
    result.workflow_steps,
    display.workflow_steps,
    resolution.workflow_steps,
  ));
  const steps = backendSteps
    || (isDocumentProcessingRequest(job)
      ? documentProcessingFallbackSteps(recorded || ACTIVE_STATUSES.has(status), failed)
      : fallbackSteps(cancelRequested ? 'cancelling' : status));

  const count = Number(
    result.requested_document_count
    || display.requested_document_count
    || input.requested_document_count
    || input.document_count
    || 0,
  );
  const userMessage = userFacingProcessingText(firstString(
    propagationContinuationMessage,
    userJobStatus.user_message,
    userJobStatus.message,
    resolution.user_message,
    job?.user_message,
    job?.display_message,
    result.display_message,
    display.user_message,
    display.display_message,
    result.user_message,
    result.message,
  ));
  const fallbackMessage = isDocumentProcessingRequest(job) && recorded
    ? `Processing started for ${count || 'the selected'} copied file(s). Check Jobs for the latest status.`
    : isDocumentProcessingRequest(job)
      ? 'Your documents were added for processing. They may appear before search and Q&A are fully ready.'
      : firstString(job?.display_message, result.display_message, display.display_message)
        || (status === 'queued'
          ? 'This job is waiting for a worker.'
          : status === 'running'
            ? 'This job is running. Refresh for the latest step.'
            : TERMINAL_SUCCESS.has(status)
              ? 'This job finished.'
              : TERMINAL_ATTENTION.has(status)
                ? 'This job needs review before it can continue.'
                : 'Refresh status or contact support if this does not change.');

  const workflowStatus = firstString(job?.workflow_status, result.workflow_status, display.workflow_status);
  const effectiveUserStatus = propagationContinues
    ? 'processing'
    : propagationNeedsSupport
      ? 'ready_with_review_needed'
      : userStatus;
  const userBadgeStatus = effectiveUserStatus === 'ready'
    ? 'succeeded'
    : effectiveUserStatus === 'ready_with_review_needed'
      ? 'needs_review'
      : effectiveUserStatus === 'failed'
        ? 'failed'
        : effectiveUserStatus === 'processing'
          ? 'running'
          : effectiveUserStatus === 'queued'
            ? 'queued'
            : effectiveUserStatus === 'canceled' || effectiveUserStatus === 'cancelled'
              ? 'unknown'
              : null;
  const badgeStatus = userBadgeStatus || (workflowStatus === 'needs_attention'
    ? 'failed'
    : workflowStatus === 'needs_review'
      ? 'pending'
    : documentSummary?.badgeStatus || fallbackBadgeStatus(cancelRequested ? 'cancelling' : status));
  const statusLabel = badgeStatus === 'failed' && String(displayStatusLabel).toLowerCase() === 'needs review'
    ? 'Needs attention'
    : displayStatusLabel;
  const nextActionLabel = actionText(firstObject(job?.next_action, result.next_action, display.next_action, resolution.next_action))
    || firstString(
      actionText(resolution.action_label),
      actionText(job?.next_action),
      actionText(result.next_action),
      actionText(display.next_action),
      isDocumentProcessingRequest(job) ? 'View processing status' : null,
      status === 'failed' ? 'Review job details' : null,
      'Refresh status',
    );
  const canCancel = Boolean(
    job?.can_cancel
    ?? display.can_cancel
    ?? result.can_cancel
    ?? (!TERMINAL_SUCCESS.has(status) && !TERMINAL_ATTENTION.has(status) && ACTIVE_STATUSES.has(status)),
  );
  const retryAction = firstObject(job?.retry_action, display.retry_action, result.retry_action) || {};
  const canRetry = Boolean(job?.can_retry ?? display.can_retry ?? result.can_retry ?? false);
  const retryActionLabel = userFacingProcessingText(firstString(
    job?.retry_action_label,
    display.retry_action_label,
    result.retry_action_label,
    actionText(retryAction),
    canRetry ? 'Retry job' : null,
  ));
  const retryMessage = userFacingProcessingText(firstString(
    job?.retry_message,
    display.retry_message,
    result.retry_message,
    retryAction.user_message,
    retryAction.message,
    canRetry ? 'Retry requeues this same job and keeps the previous attempt in activity history.' : null,
  ));
  const cancelActionLabel = userFacingProcessingText(firstString(
    job?.cancel_action_label,
    display.cancel_action_label,
    result.cancel_action_label,
    status === 'running' ? 'Request cancel' : 'Cancel job',
  ));
  const fallbackCancelMessage = isDocumentProcessingRequest(job) && recorded
    ? 'This older start record is not a running processing batch. Start text/search processing from Documents to create one.'
    : TERMINAL_SUCCESS.has(status)
      ? 'This job is finished, so there is nothing to cancel.'
      : TERMINAL_ATTENTION.has(status)
        ? 'This job is no longer running.'
        : status === 'running'
          ? 'Cancellation will be requested and the worker will stop at the next safe checkpoint when supported.'
          : 'Cancel this queued job before it starts.';

  return {
    title: jobDisplayTitle(job),
    statusLabel,
    badgeStatus,
    progressPercent,
    progressPercentLabel,
    progressEstimated,
    progressEstimateDetail: estimatedProgress?.progressEstimateDetail || null,
    progressText,
    message: userMessage || userFacingProcessingText(fallbackMessage),
    nextActionLabel,
    nextActionHash: isDocumentProcessingRequest(job) ? 'search-readiness-resolution' : null,
    steps,
    completedSteps: steps.filter((step) => step.state === 'complete').length,
    totalSteps: firstNumber(job?.total_steps, result.total_steps, display.total_steps) || steps.length || 1,
    currentStep,
    progressLabel: currentStep,
    rawStatusLabel: humanizeKey(status),
    workflowStatus,
    operatorRequired: Boolean(job?.operator_required || result.operator_required || display.operator_required || (isLegacyDocumentProcessingRequest(job) && recorded)),
    canCancel,
    cancelActionLabel,
    cancelMessage: userFacingProcessingText(firstString(
      job?.cancel_message,
      display.cancel_message,
      result.cancel_message,
      fallbackCancelMessage,
    )),
    canRetry,
    retryActionLabel,
    retryMessage,
    retryRequiresOperatorAccess: Boolean(retryAction.requires_operator_access),
    costSummary: jobCostSummary(job),
  };
}
