import { Activity, AlertTriangle, CheckCircle2, Database, GitCompare, Play, Server } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import MetricTile from '../components/MetricTile';
import NeedsAttentionPanel from '../components/NeedsAttentionPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { buildCaseAttentionItems, filterAttentionItems } from '../utils/caseAttention';
import { formatDateTime } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

function extractGoogleDrivePendingHashCount(recommendations = []) {
  const recommendation = recommendations.find((item) => {
    const text = String(item || '').toLowerCase();
    return text.includes('google drive') && text.includes('mirrored') && text.includes('not extracted');
  });
  const count = Number(String(recommendation || '').match(/google drive has\s+(\d+)/i)?.[1] || 0);
  return Number.isFinite(count) ? count : 0;
}

function normalizeSourceCoverageText(value) {
  return String(value || '')
    .replace(/queue a document processing request/gi, 'start document processing')
    .replace(/run operator text extraction/gi, 'finish text extraction')
    .replace(/source alignment audit/gi, 'source coverage check')
    .replace(/source alignment/gi, 'source coverage');
}

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'cancelling']);
const SOURCE_STABILITY_JOB_TYPES = new Set([
  'document_text_search_processing',
  'document_upload_register',
  'document_remove_plan',
  'document_language_detect',
  'document_translation_cache',
  'source_connector_scan',
]);
const DOCUMENT_PROCESSING_JOB_TYPES = new Set([
  'document_text_search_processing',
  'document_processing_request',
]);

function StatusActionCard({ title, detail, action, secondaryAction }) {
  const actionClassName = 'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10';
  const renderAction = (item, key) => {
    if (!item) {
      return null;
    }
    if (item.to) {
      return (
        <Link key={key} to={item.to} className={actionClassName}>
          {item.label}
        </Link>
      );
    }
    return (
      <button
        key={key}
        type="button"
        onClick={item.onClick}
        disabled={item.disabled}
        className={actionClassName}
      >
        {item.label}
      </button>
    );
  };

  return (
    <article className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 leading-6 text-amber-900 dark:text-amber-100">{detail}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {renderAction(action, 'primary')}
          {renderAction(secondaryAction, 'secondary')}
        </div>
      </div>
    </article>
  );
}

function routeFromHint(caseId, routeHint) {
  const hint = String(routeHint || '').trim();
  if (!hint) {
    return `/evidence/cases/${caseId}/health`;
  }
  if (hint.startsWith('/')) {
    return hint;
  }
  if (hint.startsWith('jobs')) {
    const suffix = hint.includes('#') ? hint.slice(hint.indexOf('#')) : '';
    return `/evidence/cases/${caseId}/jobs${suffix}`;
  }
  if (hint.startsWith('documents')) {
    const suffix = hint.slice('documents'.length);
    return `/evidence/cases/${caseId}/documents${suffix}`;
  }
  if (hint.startsWith('health')) {
    const suffix = hint.includes('#') ? hint.slice(hint.indexOf('#')) : '';
    return `/evidence/cases/${caseId}/health${suffix}`;
  }
  return `/evidence/cases/${caseId}/${hint}`;
}

function issueToneClasses(bucket) {
  if (bucket.status === 'resolved') {
    return 'border-emerald-700/50 bg-emerald-950/20 text-emerald-100';
  }
  if (bucket.severity === 'review') {
    return 'border-amber-800/70 bg-amber-950/20 text-amber-100';
  }
  return 'border-sky-800/70 bg-sky-950/20 text-sky-100';
}

function sampleLabel(sample) {
  if (!sample || typeof sample !== 'object') {
    return String(sample || '').trim();
  }
  return String(sample.label || sample.original_filename || sample.file_id || sample.content_hash || '').trim();
}

function sampleFileId(sample) {
  if (!sample || typeof sample !== 'object') {
    return '';
  }
  return String(sample.file_id || sample.upload_id || sample.document_id || '').trim();
}

function documentIssueRoute(caseId, bucket) {
  const samples = Array.isArray(bucket?.samples) ? bucket.samples : [];
  const fileIds = samples.map(sampleFileId).filter(Boolean);
  if (fileIds.length) {
    const params = new URLSearchParams();
    params.set('file_ids', fileIds.join(','));
    params.set('attention', bucket.bucket_id || 'review');
    params.set('from', 'health');
    return `/evidence/cases/${caseId}/documents?${params.toString()}#document-attention`;
  }
  if (bucket?.group !== 'document_readiness') {
    return routeFromHint(caseId, bucket?.route_hint);
  }
  const labels = samples.map(sampleLabel).filter(Boolean);
  if (labels.length) {
    const params = new URLSearchParams();
    params.set('q', labels[0]);
    params.set('attention', bucket.bucket_id || 'review');
    params.set('from', 'health');
    return `/evidence/cases/${caseId}/documents?${params.toString()}#document-attention`;
  }
  return routeFromHint(caseId, bucket?.route_hint);
}

function propagationActionButtonLabel(bucket) {
  if (bucket?.bucket_id === 'neo4j_stale_file_hashes') {
    return 'Review cleanup plan';
  }
  if (bucket?.group === 'document_readiness' && bucket?.status !== 'resolved') {
    return 'Review affected documents';
  }
  return bucket?.action_label || 'Open';
}

function findActionJob(action) {
  if (!action || typeof action !== 'object') {
    return null;
  }
  return action.job || action.detail?.job || action.detail?.existing_job || null;
}

function PropagationIssueReport({ actionState, onBucketAction, report, caseId, t }) {
  if (!report?.buckets?.length) {
    return null;
  }
  const groups = report.buckets.reduce((acc, bucket) => {
    const group = bucket.group || 'other';
    acc[group] = acc[group] || [];
    acc[group].push(bucket);
    return acc;
  }, {});
  const groupLabels = {
    source_propagation: 'Propagation checks',
    document_readiness: 'Document readiness',
    category_review: 'Category review',
    other: 'Other health items',
  };

  return (
    <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">{t('Propagation and category blockers')}</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
            {t('{open} open bucket(s). Sync Drive files can attempt {sync} of them; {manual} need review or a separate cleanup path.', {
              open: report.summary?.open_bucket_count ?? 0,
              sync: report.summary?.sync_resolvable_open_bucket_count ?? 0,
              manual: report.summary?.non_sync_open_bucket_count ?? 0,
            })}
          </p>
        </div>
        <Link
          to={`/evidence/cases/${caseId}/jobs#processing-status`}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
        >
          {t('Open processing jobs')}
        </Link>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {Object.entries(groups).map(([group, buckets]) => (
          <div key={group}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t(groupLabels[group] || group)}
            </h3>
            <div className="space-y-3">
              {buckets.map((bucket) => {
                const resolved = bucket.status === 'resolved';
                const sampleItems = (bucket.samples || [])
                  .map((sample) => ({
                    label: sampleLabel(sample),
                    fileId: sampleFileId(sample),
                  }))
                  .filter((sample) => sample.label)
                  .slice(0, 3);
                const actionRoute = documentIssueRoute(caseId, bucket);
                const activeAction = actionState?.bucketId === bucket.bucket_id ? actionState : null;
                const actionJob = findActionJob(activeAction?.result?.action);
                const actionDisabled = Boolean(activeAction?.running);
                return (
                  <article key={bucket.bucket_id} className={`rounded-lg border p-4 ${issueToneClasses(bucket)}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {resolved ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                          <h4 className="font-semibold">{t(bucket.label)}</h4>
                          <StatusBadge
                            status={resolved ? 'online' : bucket.severity === 'review' ? 'pending' : 'degraded'}
                            label={resolved ? t('Resolved') : t('Needs action')}
                          />
                          <span className="rounded-full border border-current/30 px-2 py-0.5 text-xs font-semibold">
                            {t('{count} {unit}', { count: bucket.count, unit: bucket.unit })}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 opacity-90">{t(bucket.user_message)}</p>
                        <p className="mt-2 text-xs leading-5 opacity-80">
                          {bucket.can_sync_resolve ? t('Sync Drive files can attempt this bucket.') : t('Sync Drive files will not clear this bucket by itself.')}
                          {' '}
                          {t(bucket.sync_resolution)}
                        </p>
                        {sampleItems.length ? (
                          <div className="mt-3 text-xs opacity-80">
                            <span className="font-semibold">{t('Examples')}:</span>
                            <ul className="mt-1 space-y-1">
                              {sampleItems.map((sample) => (
                                <li key={`${sample.fileId || sample.label}`}>
                                  {sample.fileId ? (
                                    <Link
                                      to={`/evidence/cases/${caseId}/documents/${sample.fileId}`}
                                      className="font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current"
                                    >
                                      {sample.label}
                                    </Link>
                                  ) : sample.label}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <p className="mt-3 text-xs uppercase tracking-wide opacity-70">{t(bucket.source)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onBucketAction(bucket, actionRoute)}
                        disabled={actionDisabled}
                        className="inline-flex shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                      >
                        {actionDisabled ? t('Working') : t(propagationActionButtonLabel(bucket))}
                      </button>
                    </div>
                    {activeAction?.error ? (
                      <div className="mt-3">
                        <ErrorPanel title={t('Health action failed')} error={activeAction.error} />
                      </div>
                    ) : null}
                    {activeAction?.result ? (
                      <div className="mt-3 rounded-md border border-current/20 bg-black/10 p-3 text-sm">
                        <p className="font-semibold">{t(activeAction.result.title)}</p>
                        <p className="mt-1 leading-6 opacity-90">{t(activeAction.result.message)}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          {actionJob?.job_id ? (
                            <Link
                              to={`/evidence/cases/${caseId}/jobs/${actionJob.job_id}`}
                              className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
                            >
                              {t('Open job')}
                            </Link>
                          ) : null}
                          {activeAction.result.to ? (
                            <Link
                              to={activeAction.result.to}
                              className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
                            >
                              {t(activeAction.result.linkLabel || 'Open details')}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HealthPage() {
  const { caseId } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    error: null,
    caseHealth: null,
    storageHealth: null,
    graphHealth: null,
    queueHealth: null,
    sourceAlignment: null,
    rawParity: null,
    smokeResult: null,
    smokeError: null,
    smokeRunning: false,
    alignmentJob: null,
    alignmentJobError: null,
    alignmentJobRunning: false,
    alignmentBlocked: null,
    processingRequest: null,
    processingRequestError: null,
    processingRequestRunning: false,
    propagationAction: null,
    jobs: [],
    fingerprints: [],
  });

  const loadHealth = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const token = await getAccessToken();
    const results = await Promise.allSettled([
      evidenceApi.getCaseHealth(caseId, { token }),
      evidenceApi.getRawParity(caseId, { token }),
      evidenceApi.getJobs(caseId, { limit: 25, offset: 0 }, { token }),
    ]);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const labels = ['Case health', 'Raw parity', 'Jobs'];
        recordFingerprint(result.value, labels[index]);
      }
    });

    const firstError = results.find((result) => result.status === 'rejected')?.reason || null;
    const caseHealth = fulfilledValue(results[0])?.data || null;
    setState((current) => ({
      ...current,
      loading: false,
      error: firstError,
      caseHealth,
      storageHealth: caseHealth?.storage || null,
      rawParity: fulfilledValue(results[1])?.data || null,
      graphHealth: caseHealth?.graph || null,
      queueHealth: caseHealth?.queue || null,
      sourceAlignment: caseHealth?.source_alignment || null,
      jobs: fulfilledValue(results[2])?.data?.jobs || [],
      fingerprints: results
        .filter((result) => result.status === 'fulfilled' && result.value.requestFingerprintId)
        .map((result) => ({
          id: result.value.requestFingerprintId,
          correlationId: result.value.correlationId,
        })),
    }));
  }, [caseId, getAccessToken, recordFingerprint]);

  const runStorageSmoke = useCallback(async () => {
    setState((current) => ({ ...current, smokeRunning: true, smokeError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.runStorageSmoke(caseId, { token });
      recordFingerprint(result, 'Storage smoke');
      setState((current) => ({
        ...current,
        smokeRunning: false,
        smokeResult: {
          data: result.data,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, smokeRunning: false, smokeError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const queueSourceAlignmentAudit = useCallback(async () => {
    setState((current) => ({ ...current, alignmentJobRunning: true, alignmentJobError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createJob(
        caseId,
        {
          job_type: 'source_alignment_audit',
          input_json: {
            requested_from: 'health_page',
            mode: 'read_only',
            cloud_neo4j: true,
            scan_google_drive_api: true,
          },
          priority: 0,
        },
        { token },
      );
      recordFingerprint(result, 'Queue source alignment audit');
      setState((current) => ({
        ...current,
        alignmentJobRunning: false,
        alignmentJob: {
          data: result.data,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        },
      }));
    } catch (error) {
      const detail = error?.payload?.detail || error?.payload || null;
      if (error?.status === 409 && (detail?.error === 'source_alignment_blocked_by_active_processing' || detail?.workflow_status === 'blocked_by_active_processing')) {
        setState((current) => ({
          ...current,
          alignmentJobRunning: false,
          alignmentJobError: null,
          alignmentBlocked: {
            data: detail,
            fingerprint: {
              id: error?.requestFingerprintId,
              correlationId: error?.correlationId,
            },
          },
        }));
        return;
      }
      setState((current) => ({ ...current, alignmentJobRunning: false, alignmentJobError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const requestPendingDocumentProcessing = useCallback(async () => {
    setState((current) => ({ ...current, processingRequestRunning: true, processingRequestError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.requestDocumentProcessing(
        caseId,
        {
          scope: 'copied_not_extracted',
          requested_action: 'text_extraction_and_search_indexing',
          reason: 'Need full propagation for copied Google Drive files',
          max_documents: 250,
        },
        { token },
      );
      recordFingerprint(result, 'Document text/search processing');
      setState((current) => ({
        ...current,
        processingRequestRunning: false,
        processingRequest: {
          data: result.data,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, processingRequestRunning: false, processingRequestError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const queuePropagationSourceCoverage = useCallback(async (bucket) => {
    const token = await getAccessToken();
    const result = await evidenceApi.createJob(
      caseId,
      {
        job_type: 'source_alignment_audit',
        input_json: {
          requested_from: 'health_propagation_tile',
          bucket_id: bucket?.bucket_id,
          mode: 'read_only',
          cloud_neo4j: true,
          scan_google_drive_api: true,
        },
        priority: 0,
      },
      { token },
    );
    recordFingerprint(result, `${bucket?.label || 'Source coverage'} action`);
    return {
      title: 'Source coverage check queued',
      message: 'Evidence AI queued a source coverage check. Open the job to watch whether this bucket clears or still needs review.',
      action: { job: result.data?.job || result.data },
    };
  }, [caseId, getAccessToken, recordFingerprint]);

  const resolvePropagationBucket = useCallback(async (bucket) => {
    const token = await getAccessToken();
    const textSearchBucketIds = new Set([
      'google_drive_binary_not_extracted',
      'image_ocr_needed',
      'pdf_ocr_needed',
      'spreadsheet_extraction_needed',
    ]);
    const payload = {
      cleanup_google_drive_selection: false,
      start_text_search_processing: textSearchBucketIds.has(bucket?.bucket_id),
      update_relationship_map: bucket?.bucket_id === 'relationship_map_chunks_missing',
      run_source_alignment_when_safe: false,
    };
    const result = await evidenceApi.resolveAllReadiness(caseId, payload, { token });
    recordFingerprint(result, `${bucket?.label || 'Readiness'} action`);
    const actions = [
      ...(Array.isArray(result.data?.executed_actions) ? result.data.executed_actions : []),
      ...(Array.isArray(result.data?.skipped_actions) ? result.data.skipped_actions : []),
    ];
    const action = actions.find((item) => {
      const actionId = String(item?.action_id || '');
      if (bucket?.bucket_id === 'relationship_map_chunks_missing') {
        return actionId === 'request_relationship_map_rebuild';
      }
      return actionId === 'start_text_search_processing';
    }) || actions[0] || null;
    const job = findActionJob(action);
    const status = String(action?.status || '').replaceAll('_', ' ');
    return {
      title: job?.job_id ? 'Action started' : 'Action checked',
      message: action?.display_message || action?.detail?.display_message || result.data?.display_message || (status ? `Status: ${status}.` : 'Evidence AI checked this action.'),
      action,
    };
  }, [caseId, getAccessToken, recordFingerprint]);

  const handlePropagationBucketAction = useCallback(async (bucket, actionRoute) => {
    const bucketId = bucket?.bucket_id || 'unknown';
    if (bucketId === 'neo4j_stale_file_hashes') {
      setState((current) => ({
        ...current,
        propagationAction: {
          bucketId,
          running: false,
          error: null,
          result: {
            title: 'Graph cleanup plan',
            message: 'These are graph-only file-hash references in Neo4j that are not in the current extracted document set. Sync Drive files and relationship-map rebuild add missing coverage, but they do not prune stale graph-only references yet. Review the samples and run source coverage after a graph cleanup job exists.',
            to: actionRoute,
            linkLabel: 'Open source coverage details',
          },
        },
      }));
      return;
    }

    const samples = Array.isArray(bucket?.samples) ? bucket.samples : [];
    const hasAffectedDocuments = samples.some((sample) => sampleFileId(sample));
    if (bucket?.group === 'document_readiness' && bucket?.status !== 'resolved' && hasAffectedDocuments) {
      navigate(actionRoute);
      return;
    }
    if (bucketId === 'missing_stable_file_hash') {
      navigate(actionRoute);
      return;
    }

    setState((current) => ({
      ...current,
      propagationAction: { bucketId, running: true, error: null, result: null },
    }));

    try {
      const result = bucketId === 'evidence_ledger_extraction_alignment'
        ? await queuePropagationSourceCoverage(bucket)
        : await resolvePropagationBucket(bucket);
      setState((current) => ({
        ...current,
        propagationAction: { bucketId, running: false, error: null, result },
      }));
      void loadHealth();
    } catch (error) {
      setState((current) => ({
        ...current,
        propagationAction: { bucketId, running: false, error, result: null },
      }));
    }
  }, [loadHealth, navigate, queuePropagationSourceCoverage, resolvePropagationBucket]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadHealth();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadHealth]);

  const database = state.caseHealth?.database;
  const storage = state.storageHealth || state.caseHealth?.storage;
  const graph = state.graphHealth || state.caseHealth?.graph;
  const queue = state.queueHealth || state.caseHealth?.queue || {};
  const graphError = graph?.error_message || graph?.reason;
  const graphCaseTotals = graph?.case_totals || {};
  const vectorCoverage = graph?.chunk_embedding_coverage || {};
  const parentGaps = graph?.child_parent_link_gaps || {};
  const vectorIndexes = graph?.vector_indexes || [];
  const childChunks = vectorCoverage.child_chunks || 0;
  const embeddedChildChunks = vectorCoverage.embedded_child_chunks || 0;
  const missingChildEmbeddings = vectorCoverage.missing_child_embeddings || 0;
  const missingParentEdges = parentGaps.missing_parent_edges || 0;
  const vectorOk = Boolean(graph?.ok && childChunks > 0 && missingChildEmbeddings === 0 && missingParentEdges === 0);
  const rawTables = state.rawParity?.tables || [];
  const counts = state.caseHealth?.summary?.counts || {};
  const documentProcessingReadiness = state.caseHealth?.document_processing_readiness || {};
  const copiedFilesPendingProcessing = documentProcessingReadiness.copied_not_extracted_records || counts.s3_files_not_extracted || 0;
  const copiedFileHashesPendingProcessing = documentProcessingReadiness.copied_not_extracted_hashes || 0;
  const sourceAlignment = state.sourceAlignment;
  const alignmentRows = Object.entries(sourceAlignment?.comparisons || {}).map(([name, comparison]) => ({
    name,
    ...comparison,
  }));
  const sourceAlignmentRecommendations = sourceAlignment?.recommendations || [];
  const recommendationPendingHashCount = extractGoogleDrivePendingHashCount(sourceAlignmentRecommendations);
  const driveExtraHashRow = alignmentRows.find((row) => (
    Number(row.extra_count || 0) > 0 &&
    String(row.label || row.name || '').toLowerCase().includes('google drive') &&
    String(row.label || row.name || '').toLowerCase().includes('extracted')
  ));
  const driveExtraHashCount = Number(driveExtraHashRow?.extra_count || 0) || recommendationPendingHashCount;
  const showPropagationResolution = copiedFilesPendingProcessing > 0 || driveExtraHashCount > 0 || recommendationPendingHashCount > 0;
  const alignmentRecommendations = sourceAlignmentRecommendations.slice(0, 4).map((item) => {
    const text = String(item || '');
    if (text.includes('mirrored to intake') && text.includes('not extracted')) {
      return t('Google Drive has {hashCount} unique copied file content item(s) that still need processing. Documents may show {documentCount} document row(s) because duplicate records can share one file hash. Solution: start text/search processing, then run source coverage after text and search are ready.', {
        hashCount: driveExtraHashCount || '?',
        documentCount: copiedFilesPendingProcessing || '?',
      });
    }
    return normalizeSourceCoverageText(text);
  });
  const alignmentGapCount = alignmentRows.filter((row) => !row.skipped && row.ok === false).length;
  const alignmentAvailable = Boolean(sourceAlignment?.available);
  const alignmentOk = Boolean(alignmentAvailable && sourceAlignment?.strict_alignment_ok);
  const queueConfigured = Boolean(queue.rabbitmq?.configured || queue.redis?.configured);
  const queueReady = Boolean(queue.rabbitmq?.ok && queue.redis?.ok);
  const statusActions = [];
  const processingRequestData = state.processingRequest?.data || {};
  const processingRequestStarted = Boolean(state.processingRequest && processingRequestData.can_start_processing === false);
  const processingBatchDocumentCount = Number(
    processingRequestData.requested_document_count
    || processingRequestData.job?.requested_document_count
    || processingRequestData.existing_job?.requested_document_count
    || 0,
  );
  const processingBatchDiffers = Boolean(
    processingBatchDocumentCount
    && copiedFilesPendingProcessing
    && processingBatchDocumentCount !== copiedFilesPendingProcessing,
  );
  const activeSourceStabilityJobs = state.jobs.filter((job) => (
    ACTIVE_JOB_STATUSES.has(String(job.status || '').toLowerCase()) &&
    SOURCE_STABILITY_JOB_TYPES.has(job.job_type)
  ));
  const activeSourceStabilityJob = activeSourceStabilityJobs[0] || null;
  const documentProcessingJobs = [...state.jobs]
    .filter((job) => DOCUMENT_PROCESSING_JOB_TYPES.has(job.job_type))
    .toSorted((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  const activeDocumentProcessingJob = documentProcessingJobs.find((job) => ACTIVE_JOB_STATUSES.has(String(job.status || '').toLowerCase()));
  const latestDocumentProcessingJob = activeDocumentProcessingJob || documentProcessingJobs[0] || null;
  const processingStatusAction = latestDocumentProcessingJob?.job_id
    ? { label: t('Open latest processing job'), to: `/evidence/cases/${caseId}/jobs/${latestDocumentProcessingJob.job_id}` }
    : { label: t('Open Jobs'), to: `/evidence/cases/${caseId}/jobs#processing-status` };
  const alignmentBlockedByProcessing = showPropagationResolution || state.processingRequestRunning || (processingRequestStarted && copiedFilesPendingProcessing > 0) || Boolean(activeSourceStabilityJob);
  const alignmentWaitMessage = activeSourceStabilityJob
    ? t('Text/search processing or source sync is active. Run source coverage after that work finishes so the check reads stable records.')
    : t('Run source coverage after text/search processing finishes so the check reads stable records.');
  const processingStartTitle = processingRequestData.already_started ? 'Processing already in progress' : 'Processing is being tracked';
  const processingStartMessage = processingRequestData.already_started
    ? 'Processing is already in progress. Check Jobs for per-document progress.'
    : 'Processing is queued. Check Jobs for per-document progress.';
  const pendingDocumentRowsLabel = copiedFilesPendingProcessing > 0
    ? t('{count} document row(s)', { count: copiedFilesPendingProcessing })
    : null;
  const pendingUniqueHashesLabel = (copiedFileHashesPendingProcessing || driveExtraHashCount) > 0
    ? t('{count} unique file content item(s)', { count: copiedFileHashesPendingProcessing || driveExtraHashCount })
    : null;
  const currentProcessingCountLabel = [pendingDocumentRowsLabel, pendingUniqueHashesLabel].filter(Boolean).join(', ');
  const currentProcessingCountSentence = currentProcessingCountLabel
    ? t('Current health check: {counts} still need text/search processing.', { counts: currentProcessingCountLabel })
    : t('Current health check: no copied document rows are waiting for text/search processing.');
  const sourceCoverageBadgeStatus = alignmentOk
    ? 'online'
    : alignmentBlockedByProcessing ? 'pending' : alignmentAvailable ? 'degraded' : 'unknown';
  const sourceCoverageBadgeLabel = alignmentOk
    ? t('Aligned')
    : alignmentBlockedByProcessing ? t('Waiting') : alignmentAvailable ? t('Needs review') : t('Not checked');
  const sourceCoverageDetail = alignmentBlockedByProcessing
    ? t('Run after text/search processing finishes.')
    : alignmentAvailable
      ? t('{count} strict gap(s); finished {time}', { count: alignmentGapCount, time: formatDateTime(sourceAlignment.audit_finished_at) })
      : sourceAlignment?.reason || t('Run source coverage to compare source files with processed records.');

  if (!state.loading && database && !database.ok) {
    statusActions.push({
      key: 'database',
      title: t('Database check needs support review'),
      detail: t('Case information may be slow or unavailable while the database check is unhealthy. Try a refresh; if it stays unhealthy, contact support so an operator can review the service.'),
      action: { label: t('Refresh'), onClick: loadHealth },
      secondaryAction: { label: t('Help & Support'), to: `/evidence/cases/${caseId}/support` },
    });
  }

  if (!state.loading && storage && !storage.ok) {
    statusActions.push({
      key: 'storage',
      title: t('Secure file storage needs attention'),
      detail: t('Existing records may still show, but new file copies or previews can pause until storage is healthy. Run the storage check again or contact support if it stays offline.'),
      action: { label: state.smokeRunning ? t('Running') : t('Run storage check'), onClick: runStorageSmoke, disabled: state.smokeRunning },
      secondaryAction: { label: t('Help & Support'), to: `/evidence/cases/${caseId}/support` },
    });
  }

  if (!state.loading && graph?.configured && !graph.ok) {
    statusActions.push({
      key: 'graph',
      title: t('Relationship map needs support review'),
      detail: t('People/contact links and relationship-map features may be incomplete while this check is offline. You can keep reviewing documents, and support can review the graph service.'),
      action: { label: t('Open People & Contacts'), to: `/evidence/cases/${caseId}/entities` },
      secondaryAction: { label: t('Help & Support'), to: `/evidence/cases/${caseId}/support` },
    });
  }

  if (!state.loading && queueConfigured && !queueReady) {
    statusActions.push({
      key: 'queue',
      title: t('Background processing needs attention'),
      detail: t('Jobs such as sync, processing, and alignment may wait until the queue is healthy. Open Jobs to see queued work, or refresh after the service recovers.'),
      action: { label: t('Open Jobs'), to: `/evidence/cases/${caseId}/jobs` },
      secondaryAction: { label: t('Refresh'), onClick: loadHealth },
    });
  }

  if (!state.loading && graph?.ok && !vectorOk) {
    statusActions.push({
      key: 'vectors',
      title: t('Search index coverage needs attention'),
      detail: copiedFilesPendingProcessing > 0
        ? t('Some document rows still need text extraction and search indexing before Ask Documents can cover them.')
        : t('Some relationship-map records are missing search coverage. Run source coverage after processing finishes, or ask support to review processing.'),
      action: copiedFilesPendingProcessing > 0
        ? processingStatusAction
        : { label: state.alignmentJobRunning ? t('Starting') : t('Run source coverage'), onClick: queueSourceAlignmentAudit, disabled: state.alignmentJobRunning },
      secondaryAction: copiedFilesPendingProcessing > 0 && !latestDocumentProcessingJob
        ? { label: state.processingRequestRunning ? t('Starting processing') : t('Start processing'), onClick: requestPendingDocumentProcessing, disabled: state.processingRequestRunning || processingRequestStarted }
        : { label: t('Open Documents'), to: `/evidence/cases/${caseId}/documents` },
    });
  }

  if (!state.loading && alignmentAvailable && !alignmentOk && !showPropagationResolution) {
    statusActions.push({
      key: 'alignment',
      title: t('Source check needs review'),
      detail: t('Some files do not yet match across connected sources and processed records. This affects app completeness checks, not the legal meaning of the documents. Run source coverage after reviewing the source list.'),
      action: alignmentBlockedByProcessing
        ? processingStatusAction
        : { label: state.alignmentJobRunning ? t('Starting') : t('Run source coverage'), onClick: queueSourceAlignmentAudit, disabled: state.alignmentJobRunning },
      secondaryAction: { label: t('Open Documents'), to: `/evidence/cases/${caseId}/documents` },
    });
  }

  if (!state.loading && !alignmentAvailable) {
    statusActions.push({
      key: 'alignment-missing',
      title: t('Source check has not run yet'),
      detail: t('The app has not published a current source coverage check for this case. Run one to compare connected files with processed records.'),
      action: alignmentBlockedByProcessing
        ? processingStatusAction
        : { label: state.alignmentJobRunning ? t('Starting') : t('Run source coverage'), onClick: queueSourceAlignmentAudit, disabled: state.alignmentJobRunning },
      secondaryAction: { label: t('Open Documents'), to: `/evidence/cases/${caseId}/documents` },
    });
  }
  const attentionItems = filterAttentionItems(buildCaseAttentionItems({
    caseId,
    counts,
    health: {
      ...state.caseHealth,
      storage,
      graph,
      queue,
    },
    sourceAlignment,
  }), 'health');

  useEffect(() => {
    if (state.loading || !hash) {
      return;
    }
    const target = document.getElementById(hash.slice(1));
    if (!target) {
      return;
    }
    window.setTimeout(() => target.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }, [hash, state.loading, showPropagationResolution, statusActions.length]);

  useEffect(() => {
    if (!alignmentBlockedByProcessing) {
      return undefined;
    }
    const timerId = window.setInterval(() => {
      void loadHealth();
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [alignmentBlockedByProcessing, loadHealth]);

  return (
    <div>
      <PageHeader
      title="Health"
        description="Database, storage, source coverage, and operational readiness for the active case."
        actions={
          <>
            <button
              type="button"
              onClick={loadHealth}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              {t('Refresh')}
            </button>
            <button
              type="button"
              onClick={runStorageSmoke}
              disabled={state.smokeRunning}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              {state.smokeRunning ? t('Running') : t('Run S3 smoke')}
            </button>
            <button
              type="button"
              onClick={queueSourceAlignmentAudit}
              disabled={state.alignmentJobRunning || alignmentBlockedByProcessing}
              title={alignmentBlockedByProcessing ? t('Finish document text/search processing before queueing a new source check.') : undefined}
              className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              {alignmentBlockedByProcessing ? t('Finish processing first') : state.alignmentJobRunning ? t('Starting') : t('Run source coverage')}
            </button>
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadHealth} /></div> : null}
      {state.smokeError ? <div className="mb-5"><ErrorPanel title="Storage smoke failed" error={state.smokeError} /></div> : null}
      {state.alignmentJobError ? <div className="mb-5"><ErrorPanel title="Source coverage action failed" error={state.alignmentJobError} /></div> : null}
      {state.alignmentBlocked ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold">{t(state.alignmentBlocked.data?.display_status || 'Source check waiting for processing')}</p>
              <p className="mt-1 leading-6">
                {t(state.alignmentBlocked.data?.display_message || 'Source coverage check is paused until active document or source processing finishes.')}
              </p>
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
                {alignmentWaitMessage}
              </p>
            </div>
            {state.alignmentBlocked.data?.active_jobs?.[0]?.job_id ? (
              <Link
                to={`/evidence/cases/${caseId}/jobs/${state.alignmentBlocked.data.active_jobs[0].job_id}`}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {t('Open active job')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <PropagationIssueReport
        actionState={state.propagationAction}
        onBucketAction={handlePropagationBucketAction}
        report={state.caseHealth?.propagation_issue_report}
        caseId={caseId}
        t={t}
      />

      <NeedsAttentionPanel
        items={attentionItems}
        title="Needs attention report"
        description="Central readiness issues that can block propagation, sync, source checks, access, or search."
        emptyTitle="No health attention items right now"
        emptyDetail="System checks do not show open readiness blockers."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricTile
          icon={Database}
          label="Postgres"
          value={
            <StatusBadge
              status={database?.ok ? 'online' : state.loading ? 'checking' : 'unknown'}
              label={database?.ok ? t('Online') : state.loading ? t('Checking') : t('Unknown')}
            />
          }
          detail={database?.database_name || t('No database payload')}
          tone={database?.ok ? 'good' : 'warn'}
        />
        <MetricTile
          icon={Server}
          label="S3"
          value={
            <StatusBadge
              status={storage?.ok ? 'online' : state.loading ? 'checking' : 'unknown'}
              label={storage?.ok ? t('Online') : state.loading ? t('Checking') : t('Unknown')}
            />
          }
          detail={storage?.bucket || storage?.reason || t('No bucket returned')}
          tone={storage?.ok ? 'good' : 'warn'}
        />
        <MetricTile
          icon={Activity}
          label="Graph"
          value={
            <StatusBadge
              status={graph?.ok ? 'online' : graph?.configured ? 'offline' : 'unknown'}
              label={graph?.ok ? t('Online') : graph?.configured ? t('Offline') : t('Not configured')}
            />
          }
          detail={
            graph?.ok
              ? t('{nodes} case nodes, {relationships} case relationships', { nodes: graphCaseTotals.nodes || 0, relationships: graphCaseTotals.relationships || 0 })
              : graphError || t('No Neo4j payload returned')
          }
          tone={graph?.ok ? 'good' : graph?.configured ? 'bad' : 'warn'}
        />
        <MetricTile
          icon={Activity}
          label="Queue"
          value={
            <StatusBadge
              status={queue.rabbitmq?.ok && queue.redis?.ok ? 'online' : queue.rabbitmq?.configured || queue.redis?.configured ? 'degraded' : 'unknown'}
              label={queue.rabbitmq?.ok && queue.redis?.ok ? t('Ready') : queue.rabbitmq?.configured || queue.redis?.configured ? t('Check') : t('Not configured')}
            />
          }
          detail={
            queue.rabbitmq?.ok && queue.redis?.ok
              ? t('{queue} has {count} message(s); Redis ping OK', { queue: queue.rabbitmq.queue, count: queue.rabbitmq.message_count || 0 })
              : queue.rabbitmq?.error_message || queue.redis?.error_message || queue.rabbitmq?.reason || t('Queue health not returned')
          }
          tone={queue.rabbitmq?.ok && queue.redis?.ok ? 'good' : queue.rabbitmq?.configured || queue.redis?.configured ? 'warn' : 'default'}
        />
        <MetricTile
          icon={Activity}
          label="Vectors"
          value={
            <StatusBadge
              status={vectorOk ? 'online' : graph?.ok ? 'degraded' : 'unknown'}
              label={vectorOk ? t('Covered') : graph?.ok ? t('Check coverage') : t('Waiting')}
            />
          }
          detail={
            graph?.ok
              ? t('{embedded}/{total} child chunks embedded; {missing} missing parent edges; {indexes} vector index row(s)', { embedded: embeddedChildChunks, total: childChunks, missing: missingParentEdges, indexes: vectorIndexes.length })
              : t('Connect Neo4j before vector coverage can be shown.')
          }
          tone={vectorOk ? 'good' : graph?.ok ? 'warn' : 'default'}
        />
        <MetricTile
          icon={GitCompare}
          label="Source coverage"
          value={
            <StatusBadge
              status={sourceCoverageBadgeStatus}
              label={sourceCoverageBadgeLabel}
            />
          }
          detail={sourceCoverageDetail}
          tone={alignmentOk ? 'good' : alignmentAvailable ? 'warn' : 'default'}
        />
      </div>

      {statusActions.length ? (
        <section id="status-actions" className="mt-6 space-y-3 scroll-mt-4">
          <div>
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Status actions')}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('Every item below explains what the status affects and the next step to resolve it.')}
            </p>
          </div>
          {statusActions.map((item) => (
            <StatusActionCard
              key={item.key}
              title={item.title}
              detail={item.detail}
              action={item.action}
              secondaryAction={item.secondaryAction}
            />
          ))}
        </section>
      ) : null}

      {showPropagationResolution ? (
        <section id="search-readiness-resolution" className="mt-6 scroll-mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h3 className="text-base font-semibold">{t('Full search coverage is not complete')}</h3>
              <p>
                {copiedFilesPendingProcessing > 0
                  ? t('{count} document row(s) are copied into the workspace but still need text extraction and search indexing.', { count: copiedFilesPendingProcessing })
                  : t('Source coverage found copied Google Drive files that still need text extraction and search indexing.')}
              </p>
              {(copiedFileHashesPendingProcessing || driveExtraHashCount) > 0 ? (
                <p className="text-xs text-amber-900 dark:text-amber-100">
                  {t('Health counts {count} unique file hash(es). Documents may show a larger number because multiple document rows can share the same underlying file content.', { count: copiedFileHashesPendingProcessing || driveExtraHashCount })}
                </p>
              ) : null}
              <p className="text-xs text-amber-900 dark:text-amber-100">
                {t('Why this happened: Google Drive sync copied the files, but the older processing pipeline has not run extraction, search indexing, and relationship-map indexing for those copied files yet.')}
              </p>
              <p className="text-xs text-amber-900 dark:text-amber-100">
                {t('What it affects: Ask Documents may not include these files yet, and source coverage will keep showing a gap until processing finishes.')}
              </p>
              <p className="text-xs text-amber-900 dark:text-amber-100">
                {t('Solution: start text/search processing, then run source coverage after text and search are ready.')}
              </p>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                {alignmentWaitMessage}
              </p>
              <p className="text-xs text-amber-900 dark:text-amber-100">
                {t('You can keep working in other parts of the workspace.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
              {latestDocumentProcessingJob?.job_id ? (
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${latestDocumentProcessingJob.job_id}`}
                  className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
                >
                  {t('Open latest processing job')}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={requestPendingDocumentProcessing}
                  disabled={state.processingRequestRunning || processingRequestStarted}
                  className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
                >
                  {processingRequestStarted ? t(processingStartTitle) : state.processingRequestRunning ? t('Starting processing') : t('Start processing')}
                </button>
              )}
              <Link
                to={`/evidence/cases/${caseId}/jobs#processing-status`}
                className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {t('Open Jobs')}
              </Link>
              <button
                type="button"
                onClick={queueSourceAlignmentAudit}
                disabled={state.alignmentJobRunning || alignmentBlockedByProcessing}
                title={alignmentBlockedByProcessing ? t('Finish document text/search processing before queueing a new source check.') : undefined}
                className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {alignmentBlockedByProcessing ? t('Finish processing first') : state.alignmentJobRunning ? t('Starting') : t('Run source coverage')}
              </button>
              <Link
                to={`/evidence/cases/${caseId}/documents`}
                className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {t('Open Documents')}
              </Link>
            </div>
          </div>
          {state.processingRequestError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
              <p className="font-semibold">{t('Processing did not start')}</p>
              <p className="mt-1 text-xs">{state.processingRequestError.message || t('Evidence API returned an error.')}</p>
            </div>
          ) : null}
          {state.processingRequest ? (
            <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/25 dark:text-sky-100">
              <p className="font-semibold">{t(processingStartTitle)}</p>
              <p className="mt-1 text-xs">
                {t(processingStartMessage)}
              </p>
              <p className="mt-1 text-xs">
                {currentProcessingCountSentence}
              </p>
              {processingBatchDiffers ? (
                <p className="mt-1 text-xs">
                  {t('The existing processing batch includes {count} file(s) from when it started. That can differ from the current health count after duplicates, completed files, or excluded files are accounted for.', { count: processingBatchDocumentCount })}
                </p>
              ) : null}
              {(state.processingRequest.data?.job?.job_id || state.processingRequest.data?.existing_job?.job_id) ? (
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${state.processingRequest.data.job?.job_id || state.processingRequest.data.existing_job?.job_id}`}
                  className="mt-2 inline-flex text-xs font-semibold text-sky-900 hover:text-sky-950 dark:text-sky-100 dark:hover:text-white"
                >
                  {t('Open processing details')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Raw Table Coverage')}</h3>
          <DataTable
            rows={rawTables}
            rowKey={(table) => table.name}
            emptyTitle={t('No raw parity rows returned')}
            columns={[
              { key: 'name', header: t('Table'), render: (table) => table.name },
              { key: 'postgres_rows', header: t('Postgres Rows'), render: (table) => table.postgres_rows },
            ]}
          />

          <div className="mt-6">
            <h3 id="source-coverage" className="mb-3 scroll-mt-4 text-base font-semibold text-gray-950 dark:text-white">{t('Source coverage')}</h3>
            {alignmentAvailable ? (
              <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    status={alignmentOk ? 'succeeded' : alignmentBlockedByProcessing ? 'pending' : 'degraded'}
                    label={alignmentOk ? t('Source coverage passed') : alignmentBlockedByProcessing ? t('Source check waiting for processing') : t('Source coverage has gaps')}
                  />
                  <span className="text-gray-600 dark:text-gray-400">
                    {sourceAlignment.stores?.local_source?.unique_hash_count || 0} local hashes,
                    {' '}
                    {sourceAlignment.stores?.sqlite?.document_extractions || 0} SQLite hashes,
                    {' '}
                    {sourceAlignment.stores?.google_drive_api?.unique_hash_count || 0} Drive hashes,
                    {' '}
                    {sourceAlignment.stores?.neo4j?.chunk_hashes || 0} graph chunk hashes
                  </span>
                </div>
                {alignmentRecommendations.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
                    {alignmentRecommendations.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                {sourceAlignment?.reason || t('No source coverage check has been published yet.')}
              </div>
            )}
            <DataTable
              rows={alignmentRows}
              rowKey={(row) => row.name}
              emptyTitle={t('No source coverage rows returned')}
              toolbar={(
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                  {t('Each row compares source files with processed records. Missing or extra counts can mean processing is still catching up or a source needs review. Hover the Missing or Extra number for row-specific meaning.')}
                </div>
              )}
              columns={[
                {
                  key: 'name',
                  header: t('Comparison'),
                  render: (row) => (
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-950 dark:text-white">{t(row.label || row.name.replaceAll('_', ' '))}</div>
                      <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {t('Reference')}: {t(row.reference_label || 'Reference hash set')}
                        {' | '}
                        {t('Compared to')}: {t(row.target_label || 'Target hash set')}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'ok',
                  header: t('Status'),
                  render: (row) => (
                    <StatusBadge
                      status={row.skipped ? 'unknown' : row.ok ? 'succeeded' : alignmentBlockedByProcessing ? 'pending' : 'failed'}
                      label={row.skipped ? t('Skipped') : row.ok ? t('OK') : alignmentBlockedByProcessing ? t('Waiting for processing') : t('Gap')}
                    />
                  ),
                },
                {
                  key: 'missing_count',
                  header: t('Missing'),
                  render: (row) => (
                    <span title={t(row.missing_meaning || 'Hash exists in the reference set but not the target set.')}>
                      {row.missing_count ?? '-'}
                    </span>
                  ),
                },
                {
                  key: 'extra_count',
                  header: t('Extra'),
                  render: (row) => (
                    <span title={t(row.extra_meaning || 'Hash exists in the target set but not the reference set.')}>
                      {row.extra_count ?? '-'}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Storage details')}</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ['Bucket', storage?.bucket],
                ['Region', storage?.region],
                ['Smoke Prefix', storage?.smoke_prefix],
                ['Storage status', storage?.configured ? <StatusBadge key="storage-status" status={storage?.ok ? 'online' : 'degraded'} label={storage?.ok ? t('Online') : t('Needs attention')} /> : t('Not configured')],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                  <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not returned')}</dd>
                </div>
              ))}
            </dl>
          </div>

          {state.smokeResult ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Latest Smoke')}</h3>
                <StatusBadge status={state.smokeResult.data?.ok ? 'succeeded' : 'failed'} />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Key', state.smokeResult.data?.key],
                  ['ETag', state.smokeResult.data?.etag],
                  ['Encryption', state.smokeResult.data?.server_side_encryption],
                  ['Deleted', state.smokeResult.data?.deleted ? t('yes') : t('no')],
                  ['Created', formatDateTime(state.smokeResult.data?.created_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not returned')}</dd>
                  </div>
                ))}
              </dl>
              {state.smokeResult.fingerprint?.id ? (
                <div className="mt-4">
                  <RequestFingerprint
                    fingerprintId={state.smokeResult.fingerprint.id}
                    correlationId={state.smokeResult.fingerprint.correlationId}
                    compact
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {state.alignmentJob ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Latest source coverage action')}</h3>
                <StatusBadge
                  status={state.alignmentJob.data?.display_status === 'Wait for processing' ? 'degraded' : state.alignmentJob.data?.job?.display_status || state.alignmentJob.data?.job?.status || 'queued'}
                  label={t(state.alignmentJob.data?.display_status || state.alignmentJob.data?.job?.display_status || state.alignmentJob.data?.job?.status || 'Queued')}
                />
              </div>
              {state.alignmentJob.data?.display_message || state.alignmentJob.data?.resolution?.user_message ? (
                <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  {t(state.alignmentJob.data.display_message || state.alignmentJob.data.resolution.user_message)}
                </p>
              ) : null}
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Job ID', state.alignmentJob.data?.job?.job_id || state.alignmentJob.data?.existing_job?.job_id || state.alignmentJob.data?.active_jobs?.[0]?.job_id],
                  ['Type', state.alignmentJob.data?.job?.job_type || state.alignmentJob.data?.existing_job?.job_type || state.alignmentJob.data?.active_jobs?.[0]?.job_type],
                  ['Status', state.alignmentJob.data?.job?.display_status || state.alignmentJob.data?.job?.status || state.alignmentJob.data?.workflow_status],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not returned')}</dd>
                  </div>
                ))}
              </dl>
              {(state.alignmentJob.data?.job?.job_id || state.alignmentJob.data?.existing_job?.job_id || state.alignmentJob.data?.active_jobs?.[0]?.job_id) ? (
                <Link
                  to={state.alignmentJob.data?.next_action?.route_hint || `/evidence/cases/${caseId}/jobs/${state.alignmentJob.data?.job?.job_id || state.alignmentJob.data?.existing_job?.job_id || state.alignmentJob.data?.active_jobs?.[0]?.job_id}`}
                  className="mt-3 inline-flex rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                >
                  {t(state.alignmentJob.data?.next_action?.label || 'Open job')}
                </Link>
              ) : null}
              {state.alignmentJob.fingerprint?.id ? (
                <div className="mt-4">
                  <RequestFingerprint
                    fingerprintId={state.alignmentJob.fingerprint.id}
                    correlationId={state.alignmentJob.fingerprint.correlationId}
                    compact
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Request Fingerprints')}</h3>
            <div className="mt-3 space-y-2">
              {state.fingerprints.map((fingerprint) => (
                <RequestFingerprint
                  key={fingerprint.id}
                  fingerprintId={fingerprint.id}
                  correlationId={fingerprint.correlationId}
                  compact
                />
              ))}
              {!state.fingerprints.length ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('No health fingerprints captured yet.')}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
