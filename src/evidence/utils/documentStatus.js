function normalizeStatusValue(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '_');
}

export function documentPipelineItems(document = {}) {
  const statuses = document?.pipeline_status || {};
  const display = document?.pipeline_display || {};
  return [
    {
      key: 'postgres',
      label: display.indexed?.label || 'Indexed for review',
      status: display.indexed?.status || statuses.postgres || document?.postgres_status || 'pending',
      color: '#0ea5e9',
    },
    {
      key: 'vector',
      label: display.search?.label || 'Search ready',
      status: display.search?.status || statuses.vector || document?.vector_status || 'pending',
      color: '#2563eb',
    },
    {
      key: 'graph',
      label: display.relationship_map?.label || 'Relationship map ready',
      status: display.relationship_map?.status || statuses.graph || document?.graph_status || 'pending',
      color: '#7c3aed',
    },
  ];
}

export function documentUserStatus(document = {}) {
  const propagation = document?.propagation_status || document?.library_status || {};
  const propagationStatus = typeof propagation === 'object' && propagation !== null ? propagation : {};
  const canonicalStatus = normalizeStatusValue(propagationStatus.user_status || document?.user_status);
  if (canonicalStatus) {
    const color = normalizeStatusValue(propagationStatus.status_bar_color);
    const label = propagationStatus.display_label
      || (canonicalStatus === 'ready' ? 'Ready' : canonicalStatus === 'failed' ? 'Failed' : 'Processing');
    return {
      key: canonicalStatus,
      label,
      stageLabel: propagationStatus.stage_label || label,
      badgeStatus: canonicalStatus === 'ready' ? 'succeeded' : canonicalStatus === 'failed' ? 'failed' : 'pending',
      barClassName: color === 'green' ? 'bg-emerald-500' : color === 'red' ? 'bg-red-500' : 'bg-amber-400',
      description: propagationStatus.tooltip || propagationStatus.user_message || propagationStatus.accessibility_label || label,
      accessibilityLabel: propagationStatus.accessibility_label || propagationStatus.tooltip || label,
      userMessage: propagationStatus.user_message || propagationStatus.tooltip || label,
    };
  }

  const queryStatus = normalizeStatusValue(document?.query_readiness?.status);
  const queryLabel = normalizeStatusValue(document?.query_readiness?.label);
  const reviewState = normalizeStatusValue(document?.document_review_state || document?.review_status);
  const processingStatus = normalizeStatusValue(document?.processing_status);
  const pipelineStatuses = documentPipelineItems(document).map((item) => normalizeStatusValue(item.status));
  const combined = [queryStatus, queryLabel, reviewState, processingStatus, ...pipelineStatuses].filter(Boolean);
  const pipelineCompleteStatuses = new Set(['complete', 'succeeded', 'ready', 'online', 'aligned', 'covered']);
  const allPipelineStagesComplete = pipelineStatuses.length
    && pipelineStatuses.every((status) => pipelineCompleteStatuses.has(status));
  const hasIncompletePipelineStage = pipelineStatuses.length && !allPipelineStagesComplete;

  if (combined.some((status) => ['failed', 'error', 'blocked', 'needs_attention', 'dependency_missing'].includes(status))) {
    return {
      key: 'failed',
      label: 'Failed',
      stageLabel: 'Needs attention',
      badgeStatus: 'failed',
      barClassName: 'bg-red-500',
      description: 'This document needs attention before processing can finish.',
      userMessage: 'This document needs attention before processing can finish.',
    };
  }

  if (combined.some((status) => ['needs_review', 'needs_ocr', 'unsupported_type', 'empty_text', 'ready_with_review_needed'].includes(status))) {
    return {
      key: 'review',
      label: 'Ready with review needed',
      stageLabel: 'Needs review',
      badgeStatus: 'needs_review',
      barClassName: 'bg-amber-400',
      description: 'This document is in the workspace, but something still needs review.',
      userMessage: 'This document is in the workspace, but something still needs review.',
    };
  }

  if (
    (!hasIncompletePipelineStage && (queryStatus === 'ready' || queryLabel === 'ready_for_search' || processingStatus === 'ready'))
    || allPipelineStagesComplete
  ) {
    return {
      key: 'ready',
      label: 'Ready',
      stageLabel: 'Ready',
      badgeStatus: 'succeeded',
      barClassName: 'bg-emerald-500',
      description: 'This document is ready for review and Ask Documents.',
      userMessage: 'This document is ready for review and Ask Documents.',
    };
  }

  return {
    key: 'processing',
    label: 'Processing',
    stageLabel: 'Processing',
    badgeStatus: 'pending',
    barClassName: 'bg-amber-400',
    description: 'This document is still being prepared for review and Ask Documents.',
    userMessage: 'This document is still being prepared for review and Ask Documents.',
  };
}

export function documentUserStatusForJobState(document = {}, { hasActiveProcessingJob = true } = {}) {
  const status = documentUserStatus(document);
  const statusKey = normalizeStatusValue(status.key);
  const propagation = document?.propagation_status || document?.library_status || {};
  const propagationStatus = typeof propagation === 'object' && propagation !== null ? propagation : {};
  const backendNeedsRestart = Boolean(propagationStatus.needs_restart || propagationStatus.resolution?.needs_restart || propagationStatus.next_action?.action_id === 'restart_processing');
  const backendHasActiveJob = Boolean(propagationStatus.active_job || propagationStatus.active_job_id || propagationStatus.job_id);

  if (statusKey === 'review') {
    return {
      ...status,
      key: 'failed',
      label: 'Failed',
      stageLabel: 'Needs attention',
      badgeStatus: 'failed',
      barClassName: 'bg-red-500',
      description: 'This document needs attention before full propagation can finish.',
      accessibilityLabel: 'Document needs attention before full propagation can finish.',
      userMessage: 'This document needs attention before full propagation can finish.',
    };
  }

  if (statusKey === 'processing' && (backendNeedsRestart || (!backendHasActiveJob && !hasActiveProcessingJob))) {
    return {
      ...status,
      key: 'failed',
      label: 'Failed',
      stageLabel: 'Restart needed',
      badgeStatus: 'failed',
      barClassName: 'bg-red-500',
      description: 'Full propagation is not complete and no processing job is active. Restart processing to finish this file.',
      accessibilityLabel: 'Full propagation is not complete and no processing job is active. Restart processing to finish this file.',
      userMessage: 'Full propagation is not complete and no processing job is active. Restart processing to finish this file.',
    };
  }

  return status;
}
