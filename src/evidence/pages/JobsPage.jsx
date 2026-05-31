import { Ban, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import ProgressMeter from '../components/ProgressMeter';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import useJobStatusPolling, { isActiveJob } from '../hooks/useJobStatusPolling';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, truncateMiddle } from '../utils/formatters';
import {
  isDocumentProcessingRequest,
  jobDisplayTitle,
  jobProcessingDocumentName,
  jobProcessingDocuments,
  jobProcessingRequestedCount,
  jobProcessingUniqueHashCount,
  jobProgressModel,
} from '../utils/jobProgress';

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke', 'source_alignment_audit'];

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

export default function JobsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { isRootAdmin } = useOperatorMode();
  const [state, setState] = useState({
    loading: true,
    creatingJobType: null,
    actionJobId: null,
    error: null,
    createError: null,
    actionError: null,
    jobs: [],
    total: 0,
    fingerprint: null,
    createdFingerprint: null,
  });

  const loadJobs = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getJobs(caseId, { limit: 50, offset: 0 }, { token });
      recordFingerprint(result, 'Jobs list');
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        jobs: result.data?.jobs || [],
        total: result.data?.total || 0,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const handleLiveJobs = useCallback((jobs, payload, result) => {
    setState((current) => ({
      ...current,
      loading: false,
      error: null,
      jobs,
      total: payload?.total || jobs.length,
      fingerprint: {
        id: result.requestFingerprintId,
        correlationId: result.correlationId,
      },
    }));
  }, []);

  const liveJobs = useJobStatusPolling({
    caseId,
    intervalMs: 5000,
    onJobsChange: handleLiveJobs,
  });

  const createSafeJob = useCallback(async (jobType) => {
    setState((current) => ({ ...current, creatingJobType: jobType, createError: null, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createJob(
        caseId,
        {
          job_type: jobType,
          input_json: {
            requested_from: 'phase7_web',
          },
          priority: 0,
        },
        { token },
      );
      recordFingerprint(result, `Create ${jobType} job`);
      setState((current) => ({
        ...current,
        creatingJobType: null,
        createdFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadJobs({ quiet: true });
    } catch (error) {
      setState((current) => ({ ...current, creatingJobType: null, createError: error }));
    }
  }, [caseId, getAccessToken, loadJobs, recordFingerprint]);

  const cancelJob = useCallback(async (jobId) => {
    setState((current) => ({ ...current, actionJobId: jobId, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.cancelJob(caseId, jobId, { token });
      recordFingerprint(result, 'Cancel job');
      await loadJobs({ quiet: true });
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setState((current) => ({ ...current, actionJobId: null }));
    }
  }, [caseId, getAccessToken, loadJobs, recordFingerprint]);

  const retryJob = useCallback(async (jobId) => {
    setState((current) => ({ ...current, actionJobId: jobId, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.retryJob(caseId, jobId, { token });
      recordFingerprint(result, 'Retry job');
      await loadJobs({ quiet: true });
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setState((current) => ({ ...current, actionJobId: null }));
    }
  }, [caseId, getAccessToken, loadJobs, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadJobs();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadJobs]);

  const activeJobCount = state.jobs.filter(isActiveJob).length;
  const processingRequestJobs = state.jobs.filter(isDocumentProcessingRequest);
  const generalJobs = state.jobs.filter((job) => !isDocumentProcessingRequest(job));
  const columns = [
    {
      key: 'job_type',
      header: t('Type'),
      render: (job) => (
        <Link to={`/evidence/cases/${caseId}/jobs/${job.job_id}`} className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">
          {t(jobDisplayTitle(job))}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('Status'),
      render: (job) => {
        const progress = jobProgressModel(job);
        return <StatusBadge status={progress.badgeStatus} label={t(progress.statusLabel)} />;
      },
    },
    {
      key: 'workflow',
      header: t('Workflow progress'),
      render: (job) => {
        const progress = jobProgressModel(job);
        return (
          <div className="max-w-md text-sm text-gray-700 dark:text-gray-300">
            <ProgressMeter
              value={progress.progressPercent}
              label={t(progress.progressLabel)}
              detail={t('{percent}% processed. {meaning}', { percent: progress.progressPercent, meaning: progress.progressText })}
              className="mb-2"
            />
            <p>{t(progress.message)}</p>
            <Link
              to={`/evidence/cases/${caseId}/jobs/${job.job_id}`}
              className="mt-1 inline-flex text-xs font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
            >
              {t(progress.nextActionLabel)}
            </Link>
          </div>
        );
      },
    },
    ...(isRootAdmin ? [{
      key: 'cost',
      header: t('Cost'),
      render: (job) => {
        const progress = jobProgressModel(job);
        const costText = formatJobCost(progress.costSummary);
        const costDetail = progress.costSummary?.hasPaidCost
          ? progress.costSummary?.actualUsd !== null && progress.costSummary?.actualUsd !== undefined
            ? t('Actual cost')
            : progress.costSummary?.estimatedUsd !== null && progress.costSummary?.estimatedUsd !== undefined
              ? t('Estimated cost')
              : t(progress.costSummary?.message || 'Cost recorded for this job.')
          : t(progress.costSummary?.message || 'No paid cost recorded for this job.');
        return (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <div className="font-semibold text-gray-950 dark:text-white">
              {costText || t('No paid cost recorded')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {costDetail}
            </div>
          </div>
        );
      },
    }] : []),
    { key: 'priority', header: t('Priority'), render: (job) => job.priority ?? 0 },
    { key: 'created_at', header: t('Created'), render: (job) => formatDateTime(job.created_at) },
    { key: 'started_at', header: t('Started'), render: (job) => formatDateTime(job.started_at) },
    { key: 'finished_at', header: t('Finished'), render: (job) => formatDateTime(job.finished_at) },
    { key: 'claimed_by_worker_id', header: t('Worker'), render: (job) => job.claimed_by_worker_id || t('Not claimed') },
    { key: 'error_class', header: t('Error'), render: (job) => job.error_class || t('None') },
    {
      key: 'request_fingerprint_id',
      header: t('Fingerprint'),
      render: (job) => truncateMiddle(job.request_fingerprint_id, 24),
    },
    {
      key: 'actions',
      header: t('Actions'),
      render: (job) => {
        const progress = jobProgressModel(job);
        const busy = state.actionJobId === job.job_id;
        const canRetry = ['failed', 'cancelled'].includes(job.status) && SAFE_JOB_TYPES.includes(job.job_type);
        return (
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/evidence/cases/${caseId}/jobs/${job.job_id}`}
              className="inline-flex items-center gap-1 rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
            >
              {t('Open details')}
            </Link>
            {progress.canCancel ? (
              <button
                type="button"
                onClick={() => cancelJob(job.job_id)}
                disabled={Boolean(state.actionJobId)}
                title={t(progress.cancelMessage || 'Cancel job')}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
              >
                <Ban size={13} aria-hidden="true" />
                {busy ? t('Cancelling') : t(progress.cancelActionLabel || 'Cancel job')}
              </button>
            ) : isDocumentProcessingRequest(job) ? (
              <span className="inline-flex max-w-48 items-center rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {t(progress.cancelMessage)}
              </span>
            ) : null}
            {canRetry ? (
              <button
                type="button"
                onClick={() => retryJob(job.job_id)}
                disabled={Boolean(state.actionJobId)}
                title={t('Retry failed or cancelled safe job')}
                className="inline-flex items-center gap-1 rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
              >
                <RotateCcw size={13} aria-hidden="true" />
                {busy ? t('Retrying') : t('Retry')}
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Jobs"
        description={t('{count} job records returned for this case.', { count: state.total })}
        actions={
          <>
            <button
              type="button"
              onClick={() => loadJobs()}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {t('Refresh')}
            </button>
            {SAFE_JOB_TYPES.map((jobType) => (
              <button
                key={jobType}
                type="button"
                onClick={() => createSafeJob(jobType)}
                disabled={Boolean(state.creatingJobType)}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play size={16} aria-hidden="true" />
                {state.creatingJobType === jobType ? t('Queueing') : t('Queue {jobType}', { jobType })}
              </button>
            ))}
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadJobs} /></div> : null}
      {state.createError ? <div className="mb-5"><ErrorPanel title="Job creation failed" error={state.createError} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Job action failed" error={state.actionError} /></div> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-200">
          {t('Live updates: {count} active', { count: activeJobCount || liveJobs.activeCount })}
        </span>
        {liveJobs.lastFinishedJob ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100">
            {t('Last finished: {jobType}', { jobType: liveJobs.lastFinishedJob.job_type })}
          </span>
        ) : null}
        {state.fingerprint?.id ? (
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} label="List fingerprint" />
        ) : null}
        {state.createdFingerprint?.id ? (
          <RequestFingerprint
            fingerprintId={state.createdFingerprint.id}
            correlationId={state.createdFingerprint.correlationId}
            label="Create fingerprint"
          />
        ) : null}
      </div>

      {processingRequestJobs.length ? (
        <section className="mb-5 space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold">{t('Document processing batches')}</h2>
                <p className="mt-1">
                  {t('These cards show copied files waiting for text extraction, search indexing, and source citation preparation. A received request is not an active processing run.')}
                </p>
                <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">{t('You can keep working in other parts of the workspace.')}</p>
              </div>
              <Link
                to={`/evidence/cases/${caseId}/health#search-readiness-resolution`}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {t('View processing status')}
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            {processingRequestJobs.map((job) => {
              const progress = jobProgressModel(job);
              const documents = jobProcessingDocuments(job);
              const requestedCount = jobProcessingRequestedCount(job);
              const uniqueHashes = jobProcessingUniqueHashCount(job);
              return (
                <article key={job.job_id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={progress.badgeStatus} label={t(progress.statusLabel)} />
                        <span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-gray-800 dark:text-gray-300">
                          {t('{count} copied file(s)', { count: requestedCount || documents.length })}
                        </span>
                        {uniqueHashes ? (
                          <span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-gray-800 dark:text-gray-300">
                            {t('{count} unique file hash(es)', { count: uniqueHashes })}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Text and search processing')}</h3>
                      <p className="mt-1 max-w-3xl text-sm text-gray-700 dark:text-gray-300">
                        {t('Request received. No extraction or search-indexing worker is active from this request yet. These documents remain waiting for the processing pipeline.')}
                      </p>
                      <ProgressMeter
                        value={progress.progressPercent}
                        label={t(progress.progressLabel)}
                        detail={t('{percent}% processed. {meaning}', { percent: progress.progressPercent, meaning: progress.progressText })}
                        className="mt-3 max-w-xl"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          to={`/evidence/cases/${caseId}/jobs/${job.job_id}`}
                          className="inline-flex items-center justify-center rounded-md border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                        >
                          {t('Open details')}
                        </Link>
                        <Link
                          to={`/evidence/cases/${caseId}/documents`}
                          className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                        >
                          {t('Review documents')}
                        </Link>
                      </div>
                    </div>
                    {isRootAdmin ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-black/20">
                        <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Cost')}</div>
                        <div className="mt-1 font-semibold text-gray-950 dark:text-white">
                          {formatJobCost(progress.costSummary) || t('No paid cost recorded')}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {t(progress.costSummary?.message || 'No paid cost recorded for this job.')}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex flex-col gap-1 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-gray-950 dark:text-white">{t('Documents in this batch')}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {documents.length
                          ? t('Each file is waiting for text/search processing.')
                          : t('No document list was stored with this request. Open Documents for the current pending list.')}
                      </span>
                    </div>
                    {documents.length ? (
                      <div className="max-h-96 overflow-auto">
                        <table className="w-full table-auto text-left text-sm">
                          <thead className="sticky top-0 bg-gray-50 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:bg-[#0c1218] dark:text-gray-400">
                            <tr>
                              <th className="px-3 py-2">{t('Document')}</th>
                              <th className="px-3 py-2">{t('Status')}</th>
                              <th className="px-3 py-2">{t('Progress')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {documents.map((document, index) => (
                              <tr key={`${document?.file_id || document?.content_hash || jobProcessingDocumentName(document)}-${index}`}>
                                <td className="min-w-[18rem] px-3 py-2 align-top">
                                  <div className="font-semibold text-gray-950 dark:text-white">{jobProcessingDocumentName(document)}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {document?.origin_label || document?.source_provider || t('Source file')}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <StatusBadge status="pending" label={t('Waiting for text/search processing')} />
                                </td>
                                <td className="min-w-[12rem] px-3 py-2 align-top">
                                  <ProgressMeter
                                    value={0}
                                    label={t('Waiting')}
                                    detail={t('0% processed. Text extraction has not started for this file.')}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {t('Open Documents to review the current files waiting for processing.')}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <DataTable
        rows={generalJobs}
        rowKey={(job) => job.job_id}
        loading={state.loading}
        emptyTitle={state.loading ? t('Loading jobs') : t(processingRequestJobs.length ? 'No other jobs returned' : 'No jobs returned')}
        mobileTitle={(job) => (
          <Link to={`/evidence/cases/${caseId}/jobs/${job.job_id}`} className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">
            {t(jobDisplayTitle(job))}
          </Link>
        )}
        mobileSubtitle={(job) => {
          const progress = jobProgressModel(job);
          return `${t(progress.statusLabel)} | ${formatDateTime(job.created_at)}`;
        }}
        columns={columns}
      />
    </div>
  );
}
