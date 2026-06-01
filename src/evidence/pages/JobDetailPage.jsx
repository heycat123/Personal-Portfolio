import { Archive, ArrowLeft, Ban, FileText, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import DocumentPreviewPanel from '../components/DocumentPreviewPanel';
import DocumentRemovalDialog from '../components/DocumentRemovalDialog';
import JobStatusTimeline from '../components/JobStatusTimeline';
import MetricTile from '../components/MetricTile';
import PageHeader from '../components/PageHeader';
import ProgressMeter from '../components/ProgressMeter';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { removalResultDetail, removalResultTitle } from '../utils/documentRemoval';
import { formatDateTime } from '../utils/formatters';
import {
  isDocumentProcessingRequest,
  jobDisplayTitle,
  jobProcessingDocumentName,
  jobProcessingDocuments,
  jobProcessingDocumentStatus,
  jobProcessingRequestedCount,
  jobProcessingUniqueHashCount,
  jobProgressModel,
} from '../utils/jobProgress';

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke', 'source_alignment_audit', 'agentic_quality_test'];
const LIVE_POLL_STATUSES = new Set(['queued', 'running']);

function JsonBlock({ value }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-900 dark:border-gray-800 dark:bg-[#0c1218] dark:text-gray-100">
      {JSON.stringify(value || {}, null, 2)}
    </pre>
  );
}

function Stepper({ steps }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {steps.map((step) => {
        const done = step.state === 'complete';
        const current = step.state === 'current';
        const blocked = step.state === 'blocked';
        const toneClass = done
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
          : current
            ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
            : blocked
              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200'
              : 'border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-black/20 dark:text-gray-400';
        const marker = done ? 'done' : current ? 'now' : blocked ? '!' : '';
        return (
          <li key={step.key} className="rounded-md border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border px-1 text-[10px] font-bold uppercase ${toneClass}`}>
                {marker}
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">{step.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatJobCost(costSummary) {
  const currency = costSummary?.currency || 'USD';
  const value = costSummary?.actualUsd ?? costSummary?.estimatedUsd;
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  if (!costSummary?.hasPaidCost) {
    return null;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(4)}`;
  }
}

export default function JobDetailPage() {
  const { caseId, jobId } = useParams();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { debugEnabled, isRootAdmin } = useOperatorMode();
  const [state, setState] = useState({
    loading: true,
    actionLoading: null,
    error: null,
    actionError: null,
    cleanupLoadingFileId: null,
    cleanupError: null,
    cleanupNotice: null,
    cleanupDocument: null,
    cleanupDialogOpen: false,
    job: null,
    fingerprint: null,
  });
  const [previewDrawer, setPreviewDrawer] = useState({
    open: false,
    loading: false,
    error: null,
    document: null,
    batchDocument: null,
    fingerprint: null,
    previewLoading: false,
    previewError: null,
    previewUrl: null,
    previewContentType: null,
    previewFileName: '',
  });

  const loadJob = useCallback(async (options = {}) => {
    const quiet = Boolean(options?.quiet);
    if (!quiet) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getJob(caseId, jobId, { token });
      recordFingerprint(result, 'Job detail');
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        job: result.data,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, jobId, recordFingerprint]);

  const cancelJob = useCallback(async () => {
    setState((current) => ({ ...current, actionLoading: 'cancel', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.cancelJob(caseId, jobId, { token });
      recordFingerprint(result, 'Cancel job');
      await loadJob();
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setState((current) => ({ ...current, actionLoading: null }));
    }
  }, [caseId, getAccessToken, jobId, loadJob, recordFingerprint]);

  const retryJob = useCallback(async () => {
    setState((current) => ({ ...current, actionLoading: 'retry', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.retryJob(caseId, jobId, { token });
      recordFingerprint(result, 'Retry job');
      const retriedJob = result.data?.job || result.data?.new_job;
      if (retriedJob?.job_id === jobId) {
        setState((current) => ({ ...current, job: retriedJob }));
      }
      await loadJob();
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setState((current) => ({ ...current, actionLoading: null }));
    }
  }, [caseId, getAccessToken, jobId, loadJob, recordFingerprint]);

  const archiveJob = useCallback(async () => {
    setState((current) => ({ ...current, actionLoading: 'archive', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.archiveJob(caseId, jobId, { token });
      recordFingerprint(result, 'Dismiss job');
      navigate(`/evidence/cases/${caseId}/jobs`);
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setState((current) => ({ ...current, actionLoading: null }));
    }
  }, [caseId, getAccessToken, jobId, navigate, recordFingerprint]);

  const openRemovalDialog = useCallback((document) => {
    const fileId = document?.file_id || document?.fileId || document?.id;
    if (!fileId || state.cleanupLoadingFileId) {
      return;
    }
    setState((current) => ({
      ...current,
      cleanupDocument: document,
      cleanupDialogOpen: true,
      cleanupError: null,
      cleanupNotice: null,
    }));
  }, [state.cleanupLoadingFileId]);

  const closeRemovalDialog = useCallback(() => {
    if (state.cleanupLoadingFileId) {
      return;
    }
    setState((current) => ({ ...current, cleanupDialogOpen: false }));
  }, [state.cleanupLoadingFileId]);

  const excludeProcessingDocument = useCallback(async (removalPayload) => {
    const document = state.cleanupDocument;
    const fileId = document?.file_id || document?.fileId || document?.id;
    if (!fileId || state.cleanupLoadingFileId) {
      return;
    }
    if (!removalPayload) {
      return;
    }

    setState((current) => ({
      ...current,
      cleanupLoadingFileId: fileId,
      cleanupError: null,
      cleanupNotice: null,
    }));

    try {
      const token = await getAccessToken();
      const result = await evidenceApi.excludeDocument(
        caseId,
        fileId,
        {
          ...removalPayload,
          source_job_id: jobId,
        },
        { token },
      );
      recordFingerprint(result, 'Exclude document from processing');
      setState((current) => ({
        ...current,
        cleanupLoadingFileId: null,
        cleanupError: null,
        cleanupDialogOpen: false,
        cleanupDocument: null,
        cleanupNotice: {
          fileName: jobProcessingDocumentName(document),
          title: removalResultTitle(result.data, t),
          message: removalResultDetail(result.data, removalPayload, t),
        },
      }));
      await loadJob({ quiet: true });
    } catch (error) {
      setState((current) => ({
        ...current,
        cleanupLoadingFileId: null,
        cleanupError: error,
      }));
    }
  }, [caseId, getAccessToken, jobId, loadJob, recordFingerprint, state.cleanupDocument, state.cleanupLoadingFileId, t]);

  const closeProcessingDocumentDrawer = useCallback(() => {
    setPreviewDrawer((current) => {
      if (current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        open: false,
        loading: false,
        error: null,
        document: null,
        batchDocument: null,
        fingerprint: null,
        previewLoading: false,
        previewError: null,
        previewUrl: null,
        previewContentType: null,
        previewFileName: '',
      };
    });
  }, []);

  const openProcessingDocumentDrawer = useCallback(async (document) => {
    const fileId = document?.file_id || document?.fileId || document?.id;
    if (!fileId) {
      return;
    }

    setPreviewDrawer((current) => {
      if (current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        open: true,
        loading: true,
        error: null,
        document: null,
        batchDocument: document,
        fingerprint: null,
        previewLoading: false,
        previewError: null,
        previewUrl: null,
        previewContentType: null,
        previewFileName: jobProcessingDocumentName(document),
      };
    });

    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocument(caseId, fileId, { token });
      recordFingerprint(result, 'Job document preview detail');
      const detailDocument = result.data || {};
      setPreviewDrawer((current) => ({
        ...current,
        loading: false,
        error: null,
        document: detailDocument,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
        previewLoading: Boolean(detailDocument?.s3_key),
        previewError: null,
        previewUrl: null,
        previewContentType: null,
        previewFileName: detailDocument?.original_filename || jobProcessingDocumentName(document),
      }));

      if (detailDocument?.s3_key) {
        try {
          const previewResult = await evidenceApi.previewDocument(caseId, fileId, { token });
          recordFingerprint(previewResult, 'Job document raw preview');
          const previewUrl = URL.createObjectURL(previewResult.blob);
          setPreviewDrawer((current) => {
            const currentFileId = current.document?.file_id || current.batchDocument?.file_id || current.batchDocument?.fileId || current.batchDocument?.id;
            if (currentFileId !== fileId) {
              URL.revokeObjectURL(previewUrl);
              return current;
            }
            return {
              ...current,
              previewLoading: false,
              previewError: null,
              previewUrl,
              previewContentType: previewResult.contentType,
              previewFileName: previewResult.fileName || detailDocument?.original_filename || jobProcessingDocumentName(document),
            };
          });
        } catch (previewError) {
          setPreviewDrawer((current) => {
            const currentFileId = current.document?.file_id || current.batchDocument?.file_id || current.batchDocument?.fileId || current.batchDocument?.id;
            return currentFileId === fileId
              ? { ...current, previewLoading: false, previewError }
              : current;
          });
        }
      }
    } catch (error) {
      setPreviewDrawer((current) => ({
        ...current,
        loading: false,
        previewLoading: false,
        error,
      }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadJob();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadJob]);

  useEffect(() => () => {
    if (previewDrawer.previewUrl) {
      URL.revokeObjectURL(previewDrawer.previewUrl);
    }
  }, [previewDrawer.previewUrl]);

  const job = state.job;
  const progress = job ? jobProgressModel(job) : null;
  const shouldLivePoll = Boolean(job && LIVE_POLL_STATUSES.has(job.status));

  useEffect(() => {
    if (!shouldLivePoll) {
      return undefined;
    }
    const timerId = window.setInterval(() => {
      void loadJob({ quiet: true });
    }, 1500);
    return () => window.clearInterval(timerId);
  }, [loadJob, shouldLivePoll]);

  const canCancel = Boolean(progress?.canCancel);
  const canRetry = job && ['failed', 'cancelled'].includes(job.status) && SAFE_JOB_TYPES.includes(job.job_type);
  const canArchive = Boolean(job && progress && !progress.canCancel && !job.archived_at);
  const isProcessingRequest = isDocumentProcessingRequest(job);
  const processingDocuments = isProcessingRequest
    ? jobProcessingDocuments(job).filter((document) => !['excluded_from_case', 'workspace_copy_deleted'].includes(String(document?.status || '').toLowerCase()))
    : [];
  const processingDocumentCount = isProcessingRequest ? jobProcessingRequestedCount(job) : 0;
  const excludedProcessingDocumentCount = isProcessingRequest
    ? Math.max(0, (processingDocumentCount || 0) - processingDocuments.length)
    : 0;
  const processingUniqueHashes = isProcessingRequest ? jobProcessingUniqueHashCount(job) : 0;
  const costText = progress ? formatJobCost(progress.costSummary) : null;
  const costDetail = progress?.costSummary?.hasPaidCost
    ? progress.costSummary?.actualUsd !== null && progress.costSummary?.actualUsd !== undefined
      ? t('Actual cost')
      : progress.costSummary?.estimatedUsd !== null && progress.costSummary?.estimatedUsd !== undefined
        ? t('Estimated cost')
        : t(progress.costSummary?.message || 'Cost recorded for this job.')
    : t(progress?.costSummary?.message || 'No paid cost recorded for this job.');
  const drawerBatchDocument = previewDrawer.batchDocument || {};
  const drawerDocument = previewDrawer.document || {};
  const drawerDocumentStatus = previewDrawer.batchDocument ? jobProcessingDocumentStatus(previewDrawer.batchDocument) : null;
  const drawerFileId = drawerDocument.file_id || drawerBatchDocument.file_id || drawerBatchDocument.fileId || drawerBatchDocument.id;
  const drawerFileName = drawerDocument.original_filename || previewDrawer.previewFileName || jobProcessingDocumentName(drawerBatchDocument);
  const cleanupFileId = state.cleanupDocument?.file_id || state.cleanupDocument?.fileId || state.cleanupDocument?.id;
  const cleanupHasSecureWorkspaceCopy = Boolean(state.cleanupDocument?.s3_key || previewDrawer.document?.s3_key || cleanupFileId);

  return (
    <div>
      <PageHeader
        title={job ? t(jobDisplayTitle(job)) : 'Job Detail'}
        description={job?.job_id || jobId}
        translateTitle={!job}
        translateDescription={false}
        actions={
          <>
            <button
              type="button"
              onClick={() => loadJob()}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} className={shouldLivePoll ? 'animate-spin' : ''} aria-hidden="true" />
              {t('Refresh')}
            </button>
            {canCancel ? (
              <button
                type="button"
                onClick={cancelJob}
                disabled={Boolean(state.actionLoading)}
                title={progress?.cancelMessage ? t(progress.cancelMessage) : t('Cancel job')}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                <Ban size={16} aria-hidden="true" />
                {state.actionLoading === 'cancel' ? t('Cancelling') : t(progress?.cancelActionLabel || 'Cancel job')}
              </button>
            ) : null}
            {canRetry ? (
              <button
                type="button"
                onClick={retryJob}
                disabled={Boolean(state.actionLoading)}
                className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={16} aria-hidden="true" />
                {state.actionLoading === 'retry' ? t('Retrying') : t('Retry')}
              </button>
            ) : null}
            {canArchive ? (
              <button
                type="button"
                onClick={archiveJob}
                disabled={Boolean(state.actionLoading)}
                title={t('Dismiss this job from the default list. History stays available for support.')}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                <Archive size={16} aria-hidden="true" />
                {state.actionLoading === 'archive' ? t('Dismissing') : t('Dismiss')}
              </button>
            ) : null}
            <Link
              to={`/evidence/cases/${caseId}/jobs`}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('Jobs')}
            </Link>
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadJob} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Job action failed" error={state.actionError} /></div> : null}

      {state.fingerprint?.id ? (
        <div className="mb-5">
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        </div>
      ) : null}

      {job ? (
        <>
          {progress ? (
            <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <div className="mb-2">
                    <StatusBadge status={progress.badgeStatus} label={t(progress.statusLabel)} />
                  </div>
                  <h2 className="text-base font-semibold">{t(progress.title)}</h2>
                  <p className="mt-1">{t(progress.message)}</p>
                  {shouldLivePoll ? (
                    <p className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-100">
                      {t('Live updates are on. This page refreshes progress every few seconds while processing is active.')}
                    </p>
                  ) : null}
                  {isProcessingRequest && !progress.canCancel && progress.progressPercent === 0 ? (
                    <p className="mt-2 font-semibold">
                      {t('This older start record did not create a running processing batch. Start text/search processing from Documents to create a cancellable batch with per-file progress.')}
                    </p>
                  ) : null}
                  <ProgressMeter
                    value={progress.progressPercent}
                    valueLabel={progress.progressPercentLabel}
                    label={t(progress.progressLabel)}
                    detail={[
                      t('{percentLabel} processed. {meaning}', {
                        percentLabel: progress.progressPercentLabel,
                        meaning: progress.progressText,
                      }),
                      progress.progressEstimateDetail ? t(progress.progressEstimateDetail) : null,
                    ].filter(Boolean).join(' ')}
                    className="mt-3 max-w-lg"
                  />
                  {isProcessingRequest ? (
                    <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
                      {t('Processing readiness means the app can search and cite the document. It does not decide legal importance, completeness, or whether a legal requirement is satisfied.')}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
                    {t('You can keep working in other parts of the workspace.')}
                  </p>
                  {!progress.canCancel && isProcessingRequest ? (
                    <p className="mt-1 text-xs font-semibold text-amber-900 dark:text-amber-100">
                      {t(progress.cancelMessage)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                  {isProcessingRequest ? (
                    <Link
                      to={`/evidence/cases/${caseId}/health#search-readiness-resolution`}
                      className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
                    >
                      {t('View processing status')}
                    </Link>
                  ) : null}
                  <Link
                    to={isProcessingRequest ? `/evidence/cases/${caseId}/documents` : `/evidence/cases/${caseId}/jobs`}
                    className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
                  >
                    {t(isProcessingRequest ? 'Review documents' : 'Open jobs')}
                  </Link>
                </div>
              </div>
              <div className="mt-4">
                <Stepper steps={progress.steps.map((step) => ({ ...step, label: t(step.label) }))} />
              </div>
            </section>
          ) : null}

          {isProcessingRequest ? (
            <section className="mb-5 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex flex-col gap-2 border-b border-gray-200 p-4 dark:border-gray-800 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Documents in this processing batch')}</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {excludedProcessingDocumentCount
                      ? t('{visible} file(s) are still shown in this batch. {total} copied file(s) were included when processing started.', {
                        visible: processingDocuments.length,
                        total: processingDocumentCount,
                      })
                      : t('{count} copied file(s) are included in this processing batch.', { count: processingDocumentCount || processingDocuments.length })}
                    {processingUniqueHashes ? ` ${t('{count} unique file hash(es).', { count: processingUniqueHashes })}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t('Each listed file shows its current text/search processing state. Files that need OCR or another extractor will stay marked for review.')}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t('If a file does not belong in this case, remove it from workspace processing. Soft remove keeps the secure workspace copy. Delete workspace copy removes the secure cloud copy too. The original source file is not deleted.')}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t('If you want to keep the file, resolve it by uploading or exporting a searchable copy, such as a PDF, image, text file, or transcript, then start text/search processing again.')}
                  </p>
                </div>
                <Link
                  to={`/evidence/cases/${caseId}/documents`}
                  className="inline-flex shrink-0 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                >
                  {t('Open Documents')}
                </Link>
              </div>
              {state.cleanupError ? (
                <div className="px-4 pt-4">
                  <ErrorPanel title={t('Exclude action failed')} error={state.cleanupError} />
                </div>
              ) : null}
              {state.cleanupNotice ? (
                <div className="mx-4 mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <div className="font-semibold">{state.cleanupNotice.title || t('Removed from workspace')}</div>
                  {state.cleanupNotice.fileName ? <div className="mt-1 font-semibold">{state.cleanupNotice.fileName}</div> : null}
                  {state.cleanupNotice.message ? <div className="mt-1">{state.cleanupNotice.message}</div> : null}
                </div>
              ) : null}
              {processingDocuments.length ? (
                <div className="max-h-[28rem] space-y-2 overflow-auto p-3">
                  {processingDocuments.map((document, index) => {
                    const documentStatus = jobProcessingDocumentStatus(document);
                    const fileId = document?.file_id || document?.fileId || document?.id;
                    const canInspect = Boolean(fileId);
                    const cleanupBusy = state.cleanupLoadingFileId === fileId;
                    return (
                      <article
                        key={`${document?.file_id || document?.content_hash || jobProcessingDocumentName(document)}-${index}`}
                        className={`grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm transition dark:border-gray-800 dark:bg-[#0c1218] md:grid-cols-[minmax(0,1.35fr)_minmax(10rem,0.75fr)_minmax(12rem,1fr)_auto] ${
                          canInspect ? 'cursor-pointer hover:border-sky-300 hover:bg-sky-50/60 focus-within:border-sky-400 dark:hover:border-sky-900 dark:hover:bg-sky-950/20' : ''
                        }`}
                        onClick={() => canInspect && openProcessingDocumentDrawer(document)}
                      >
                        <div className="min-w-0">
                          {canInspect ? (
                            <button
                              type="button"
                              className="break-words text-left font-semibold text-gray-950 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-white dark:hover:text-sky-300"
                              onClick={(event) => {
                                event.stopPropagation();
                                openProcessingDocumentDrawer(document);
                              }}
                            >
                              {jobProcessingDocumentName(document)}
                            </button>
                          ) : (
                            <div className="break-words font-semibold text-gray-950 dark:text-white">{jobProcessingDocumentName(document)}</div>
                          )}
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {document?.origin_label || document?.source_provider || t('Source file')}
                          </div>
                          {canInspect ? (
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                              <FileText size={13} aria-hidden="true" />
                              {t('Click to inspect')}
                            </div>
                          ) : (
                            <Link
                              to={`/evidence/cases/${caseId}/documents`}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <FileText size={13} aria-hidden="true" />
                              {t('Open Documents to review')}
                            </Link>
                          )}
                        </div>
                        <div>
                          <StatusBadge status={documentStatus.badgeStatus} label={t(documentStatus.label)} />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(documentStatus.message)}</p>
                        </div>
                        <ProgressMeter
                          value={documentStatus.progressPercent}
                          label={t(documentStatus.label)}
                          detail={t('{percent}% processed. {meaning}', {
                            percent: documentStatus.progressPercent,
                            meaning: documentStatus.message,
                          })}
                        />
                        <div className="flex items-start justify-start md:justify-end">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRemovalDialog(document);
                            }}
                            disabled={!fileId || Boolean(state.cleanupLoadingFileId)}
                            title={fileId ? t('Choose soft remove or delete the secure workspace copy. The original source file is not deleted.') : t('Open Documents to review this file.')}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            {cleanupBusy ? t('Removing') : t('Remove from workspace')}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
                  {t('This job did not store a document list. Open Documents for the current pending processing list.')}
                </div>
              )}
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label={t('Status')}
              value={<StatusBadge status={progress.badgeStatus} label={t(progress.statusLabel)} />}
              detail={t('Processing workflow status')}
            />
            <MetricTile label={t('Priority')} value={job.priority ?? 0} detail={t('Higher priority runs first')} />
            <MetricTile label={t('Created')} value={formatDateTime(job.created_at)} detail={job.created_by_user_id || t('No user recorded')} />
            <MetricTile label={t('Worker')} value={job.claimed_by_worker_id || t('Not claimed')} detail={job.error_class || t('No error class')} />
            {isRootAdmin ? (
              <MetricTile
                label={t('Cost')}
                value={costText || t('No paid cost recorded')}
                detail={costDetail}
              />
            ) : null}
          </div>

          <section className="mt-6">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Latest activity')}</h3>
            <JobStatusTimeline events={job.events || []} limit={debugEnabled ? 0 : 4} />
          </section>

          {debugEnabled ? (
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Input')}</h3>
                <JsonBlock value={job.input_json} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Result')}</h3>
                <JsonBlock value={job.result_json} />
              </div>
            </div>
          ) : null}

          {job.error_message_redacted ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
              {job.error_message_redacted}
            </div>
          ) : null}
        </>
      ) : null}

      {previewDrawer.open ? (
        <div className="fixed inset-0 z-50 bg-black/50" role="presentation">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#0f1720]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                  {t('Processing batch document')}
                </div>
                <h2 className="mt-1 break-words text-xl font-semibold text-gray-950 dark:text-white">
                  {drawerFileName || t('Selected document')}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {drawerDocument.source_provider || drawerBatchDocument.origin_label || drawerBatchDocument.source_provider || t('Source file')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeProcessingDocumentDrawer}
                className="rounded-md border border-transparent p-2 text-gray-500 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label={t('Close document preview')}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {previewDrawer.error ? (
                <ErrorPanel title={t('Document preview failed')} error={previewDrawer.error} />
              ) : null}
              {previewDrawer.loading ? (
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                  {t('Loading document details.')}
                </div>
              ) : (
                <>
                  <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Current processing status')}</div>
                        <div className="mt-1">
                          {drawerDocumentStatus ? (
                            <StatusBadge status={drawerDocumentStatus.badgeStatus} label={t(drawerDocumentStatus.label)} />
                          ) : (
                            <StatusBadge status="unknown" label={t('Needs review')} />
                          )}
                        </div>
                        {drawerDocumentStatus?.message ? (
                          <p className="mt-2 text-gray-600 dark:text-gray-400">{t(drawerDocumentStatus.message)}</p>
                        ) : null}
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Source')}</div>
                        <p className="mt-1 text-gray-900 dark:text-gray-100">
                          {drawerDocument.source_provider || drawerBatchDocument.origin_label || drawerBatchDocument.source_provider || t('Source file')}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Secure workspace copy')}</div>
                        <p className="mt-1 text-gray-900 dark:text-gray-100">
                          {drawerDocument.s3_key ? t('Available') : t('Not recorded')}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Search readiness')}</div>
                        <p className="mt-1 text-gray-900 dark:text-gray-100">
                          {drawerDocument.query_readiness?.label || drawerDocument.query_readiness?.status || drawerDocumentStatus?.label || t('Needs review')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {drawerFileId ? (
                        <Link
                          to={`/evidence/cases/${caseId}/documents/${drawerFileId}`}
                          className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                        >
                          <FileText size={16} aria-hidden="true" />
                          {t('Open document details')}
                        </Link>
                      ) : (
                        <Link
                          to={`/evidence/cases/${caseId}/documents`}
                          className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                        >
                          <FileText size={16} aria-hidden="true" />
                          {t('Open Documents to review')}
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => openRemovalDialog(drawerDocument.file_id ? drawerDocument : drawerBatchDocument)}
                        disabled={!drawerFileId || Boolean(state.cleanupLoadingFileId)}
                        className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/60 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/30"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        {state.cleanupLoadingFileId === drawerFileId ? t('Removing') : t('Remove from workspace')}
                      </button>
                    </div>
                  </section>

                  <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Source file preview')}</h3>
                      {drawerDocument.s3_key ? <StatusBadge status="configured" label={t('Secure workspace copy')} /> : <StatusBadge status="degraded" label={t('No secure copy')} />}
                    </div>
                    {previewDrawer.previewLoading ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('Loading source file preview...')}</p>
                    ) : (
                      <DocumentPreviewPanel
                        previewUrl={previewDrawer.previewUrl}
                        previewError={previewDrawer.previewError}
                        contentType={previewDrawer.previewContentType || drawerDocument.media_type}
                        fileName={drawerFileName}
                        document={drawerDocument}
                      />
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!job && state.loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
          {t('Loading job.')}
        </div>
      ) : null}
      <DocumentRemovalDialog
        busy={Boolean(state.cleanupLoadingFileId)}
        documentName={state.cleanupDocument ? jobProcessingDocumentName(state.cleanupDocument) : drawerFileName}
        hasSecureWorkspaceCopy={cleanupHasSecureWorkspaceCopy}
        onClose={closeRemovalDialog}
        onConfirm={excludeProcessingDocument}
        open={Boolean(state.cleanupDialogOpen)}
      />
    </div>
  );
}
