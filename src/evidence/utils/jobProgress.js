import { humanizeKey } from './formatters';

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const TERMINAL_SUCCESS = new Set(['succeeded', 'success', 'completed']);
const DOCUMENT_PROCESSING_TOTAL_STEPS = 5;

export function isDocumentProcessingRequest(job) {
  return job?.job_type === 'document_processing_request';
}

function processingRequestResult(job) {
  return job?.result_json || job?.result || {};
}

function displayWrapper(job) {
  return job?.display || job?.display_contract || {};
}

function resolutionPayload(job, result, display) {
  return job?.resolution || display?.resolution || result?.resolution || result?.readiness_resolution || result?.document_processing_readiness?.resolution || {};
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || null;
}

function actionText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  return firstString(value.label, value.action_label, value.title, value.user_message, value.message);
}

function requestRecorded(job) {
  return TERMINAL_SUCCESS.has(String(job?.status || '').toLowerCase()) || Boolean(processingRequestResult(job)?.ok);
}

export function jobDisplayTitle(job) {
  if (isDocumentProcessingRequest(job)) {
    return 'Document processing request';
  }
  return humanizeKey(job?.job_type || 'Job');
}

export function jobProgressModel(job) {
  const status = String(job?.status || 'unknown').toLowerCase();
  const result = processingRequestResult(job);
  const input = job?.input_json || {};

  if (isDocumentProcessingRequest(job)) {
    const display = displayWrapper(job);
    const resolution = resolutionPayload(job, result, display);
    const count = Number(
      result.requested_document_count
      || display.requested_document_count
      || input.requested_document_count
      || input.document_count
      || 0,
    );
    const recorded = requestRecorded(job);
    const failed = ['failed', 'cancelled'].includes(status);
    const backendPercent = Number(job?.progress_percent ?? result.progress_percent ?? display.progress_percent);
    const hasBackendPercent = Number.isFinite(backendPercent);
    const backendTotalSteps = Number(job?.total_steps ?? result.total_steps ?? display.total_steps);
    const totalSteps = Number.isFinite(backendTotalSteps) && backendTotalSteps > 0
      ? backendTotalSteps
      : DOCUMENT_PROCESSING_TOTAL_STEPS;
    const completedSteps = failed ? 0 : recorded ? 1 : 0;
    const progressPercent = hasBackendPercent
      ? Math.max(0, Math.min(100, backendPercent))
      : failed
        ? 0
        : recorded
          ? Math.round((completedSteps / totalSteps) * 100)
          : 5;
    const statusLabel = firstString(
      job?.display_status,
      display.display_status,
      display.status_label,
      job?.status_label,
      result.display_status,
      result.status_label,
      failed ? 'Needs review' : recorded ? 'Request recorded' : 'Request received',
    );
    const currentStep = firstString(
      job?.current_step,
      result.current_step,
      display.current_step,
      resolution.current_step,
      recorded ? 'Operator processing required' : 'Waiting to record request',
    );
    const userMessage = firstString(
      resolution.user_message,
      job?.user_message,
      job?.display_message,
      result.display_message,
      display.user_message,
      display.display_message,
      result.user_message,
      result.message,
    );
    const nextActionLabel = firstString(
      resolution.action_label,
      actionText(job?.next_action),
      actionText(result.next_action),
      actionText(display.next_action),
      actionText(resolution.next_action),
      'View processing status',
    );
    const steps = [
      {
        key: 'request',
        label: 'Request received',
        state: failed ? 'blocked' : recorded || ACTIVE_STATUSES.has(status) ? 'complete' : 'current',
      },
      {
        key: 'operator',
        label: 'Operator processing run',
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

    return {
      title: 'Document processing',
      statusLabel,
      badgeStatus: failed ? 'degraded' : 'pending',
      progressPercent,
      progressText: failed ? 'Needs attention' : hasBackendPercent ? currentStep : recorded ? '1 of 5 steps complete' : 'Waiting to record request',
      message: userMessage || (recorded
        ? `Request received for ${count || 'the selected'} copied file(s). Text extraction, search indexing, and source citation coverage still require the operator processing run.`
        : 'Your documents were added for processing. They may appear before search and Q&A are fully ready. Operator processing is still required.'),
      nextActionLabel,
      nextActionHash: 'search-readiness-resolution',
      steps,
      completedSteps,
      totalSteps,
      currentStep,
      progressLabel: currentStep,
      rawStatusLabel: humanizeKey(status),
      workflowStatus: firstString(job?.workflow_status, result.workflow_status, display.workflow_status),
      operatorRequired: true,
    };
  }

  if (status === 'queued') {
    return {
      title: jobDisplayTitle(job),
      statusLabel: 'Queued',
      badgeStatus: 'queued',
      progressPercent: 0,
      progressText: 'Waiting to start',
      message: job?.display_message || 'This job is waiting for a worker.',
      steps: [],
      rawStatusLabel: humanizeKey(status),
    };
  }

  if (status === 'running') {
    return {
      title: jobDisplayTitle(job),
      statusLabel: 'Running',
      badgeStatus: 'running',
      progressPercent: 50,
      progressText: 'In progress',
      message: job?.display_message || 'This job is running.',
      steps: [],
      rawStatusLabel: humanizeKey(status),
    };
  }

  if (TERMINAL_SUCCESS.has(status)) {
    return {
      title: jobDisplayTitle(job),
      statusLabel: 'Complete',
      badgeStatus: 'succeeded',
      progressPercent: 100,
      progressText: 'Complete',
      message: job?.display_message || 'This job completed.',
      steps: [],
      rawStatusLabel: humanizeKey(status),
    };
  }

  if (['failed', 'cancelled'].includes(status)) {
    return {
      title: jobDisplayTitle(job),
      statusLabel: 'Needs attention',
      badgeStatus: 'degraded',
      progressPercent: 0,
      progressText: humanizeKey(status),
      message: job?.display_message || 'This job needs review before it can continue.',
      steps: [],
      rawStatusLabel: humanizeKey(status),
    };
  }

  return {
    title: jobDisplayTitle(job),
    statusLabel: humanizeKey(status),
    badgeStatus: 'unknown',
    progressPercent: 0,
    progressText: 'Status unknown',
    message: job?.display_message || 'Refresh status or contact support if this does not change.',
    steps: [],
    rawStatusLabel: humanizeKey(status),
  };
}
