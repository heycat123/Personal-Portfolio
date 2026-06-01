import { Archive, Ban, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import useJobStatusPolling, { isActiveJob } from '../hooks/useJobStatusPolling';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';
import {
  isDocumentProcessingRequest,
  jobDisplayTitle,
  jobProcessingDocuments,
  jobProcessingRequestedCount,
  jobProgressModel,
} from '../utils/jobProgress';

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke', 'source_alignment_audit'];

function CompactProgress({ progress, t }) {
  return (
    <div className="min-w-0 text-xs" title={t(progress.progressText)}>
      <div className="flex items-center justify-between gap-2 font-semibold text-gray-800 dark:text-gray-100">
        <span className="truncate">{t(progress.progressLabel)}</span>
        <span className="shrink-0">{progress.progressPercent}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-black/40">
        <div
          className="h-full rounded-full bg-sky-600 dark:bg-sky-400"
          style={{ width: `${Math.max(0, Math.min(100, progress.progressPercent))}%` }}
        />
      </div>
      <p className="mt-1 truncate text-gray-500 dark:text-gray-400">{t(progress.progressText)}</p>
    </div>
  );
}

function TimeSummary({ job, t }) {
  const rows = [
    { label: 'Created', value: job.created_at ? formatDateTime(job.created_at) : t('Unknown') },
    { label: 'Started', value: job.started_at ? formatDateTime(job.started_at) : t('Not started') },
    { label: 'Finished', value: job.finished_at ? formatDateTime(job.finished_at) : t(isActiveJob(job) ? 'Still running' : 'Not finished') },
  ];
  return (
    <dl className="grid gap-1 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-3 lg:block">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-500">{t(row.label)}</dt>
          <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function JobsPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
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

  const archiveJob = useCallback(async (jobId) => {
    setState((current) => ({ ...current, actionJobId: jobId, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.archiveJob(caseId, jobId, { token });
      recordFingerprint(result, 'Dismiss job');
      setState((current) => ({
        ...current,
        jobs: current.jobs.filter((job) => job.job_id !== jobId),
        total: Math.max(0, current.total - 1),
      }));
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
  const processingJobs = [...state.jobs]
    .filter(isDocumentProcessingRequest)
    .toSorted((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  const latestProcessingJob = processingJobs[0] || null;
  const latestProcessingProgress = latestProcessingJob ? jobProgressModel(latestProcessingJob) : null;
  const activeProcessingJobs = processingJobs.filter((job) => jobProgressModel(job).canCancel || isActiveJob(job)).length;
  const processingDocumentCount = processingJobs.reduce((sum, job) => sum + (jobProcessingRequestedCount(job) || jobProcessingDocuments(job).length || 0), 0);
  const renderJobSummary = (job) => {
    const progress = jobProgressModel(job);
    return (
      <div className="min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              to={`/evidence/cases/${caseId}/jobs/${job.job_id}`}
              className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
            >
              {t(jobDisplayTitle(job))}
            </Link>
            <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
              {t(progress.message)}
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={progress.badgeStatus} label={t(progress.statusLabel)} />
          </div>
        </div>
        <div className="mt-3 max-w-xl">
          <CompactProgress progress={progress} t={t} />
        </div>
      </div>
    );
  };

  const renderJobActions = (job) => {
    const progress = jobProgressModel(job);
    const busy = state.actionJobId === job.job_id;
    const canRetry = ['failed', 'cancelled'].includes(job.status) && SAFE_JOB_TYPES.includes(job.job_type);
    const canArchive = !progress.canCancel && !job.archived_at;
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/evidence/cases/${caseId}/jobs/${job.job_id}`}
          className="inline-flex items-center gap-1 rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
        >
          {t('Open')}
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
        {canArchive ? (
          <button
            type="button"
            onClick={() => archiveJob(job.job_id)}
            disabled={Boolean(state.actionJobId)}
            title={t('Dismiss this job from the default list. History stays available for support.')}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
          >
            <Archive size={13} aria-hidden="true" />
            {busy ? t('Dismissing') : t('Dismiss')}
          </button>
        ) : null}
      </div>
    );
  };

  const columns = [
    {
      key: 'job',
      header: t('Job'),
      headerClassName: 'w-[58%]',
      render: renderJobSummary,
    },
    { key: 'timeline', header: t('Timeline'), headerClassName: 'w-[24%]', render: (job) => <TimeSummary job={job} t={t} /> },
    {
      key: 'actions',
      header: t('Actions'),
      headerClassName: 'w-[18%]',
      render: renderJobActions,
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

      {latestProcessingJob && latestProcessingProgress ? (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{t('Processing at a glance')}</h2>
                <StatusBadge status={latestProcessingProgress.badgeStatus} label={t(latestProcessingProgress.statusLabel)} />
                <span className="rounded-full border border-amber-300/70 px-2.5 py-1 text-xs font-semibold dark:border-amber-900">
                  {t('{count} processing job(s)', { count: processingJobs.length })}
                </span>
                {activeProcessingJobs ? (
                  <span className="rounded-full border border-amber-300/70 px-2.5 py-1 text-xs font-semibold dark:border-amber-900">
                    {t('{count} active', { count: activeProcessingJobs })}
                  </span>
                ) : null}
                {processingDocumentCount ? (
                  <span className="rounded-full border border-amber-300/70 px-2.5 py-1 text-xs font-semibold dark:border-amber-900">
                    {t('{count} copied file(s)', { count: processingDocumentCount })}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
                {t('Latest processing job: {title}. {message}', {
                  title: t(jobDisplayTitle(latestProcessingJob)),
                  message: t(latestProcessingProgress.message),
                })}
              </p>
              <div className="mt-2 max-w-xl">
                <CompactProgress progress={latestProcessingProgress} t={t} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                to={`/evidence/cases/${caseId}/jobs/${latestProcessingJob.job_id}`}
                className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {t('Open latest')}
              </Link>
              <Link
                to={`/evidence/cases/${caseId}/health#search-readiness-resolution`}
                className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                {t('View processing status')}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <DataTable
        rows={state.jobs}
        rowKey={(job) => job.job_id}
        loading={state.loading}
        emptyTitle={state.loading ? t('Loading jobs') : t('No jobs returned')}
        onRowSelect={(job) => navigate(`/evidence/cases/${caseId}/jobs/${job.job_id}`)}
        mobileTitle={(job) => (
          <Link to={`/evidence/cases/${caseId}/jobs/${job.job_id}`} className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">
            {t(jobDisplayTitle(job))}
          </Link>
        )}
        mobileSubtitle={(job) => {
          const progress = jobProgressModel(job);
          return `${t(progress.statusLabel)} | ${formatDateTime(job.created_at)}`;
        }}
        mobileMetrics={(job) => [
          { id: 'progress', header: 'Progress', render: () => <CompactProgress progress={jobProgressModel(job)} t={t} /> },
          { id: 'timeline', header: 'Timeline', render: () => <TimeSummary job={job} t={t} /> },
        ]}
        mobileActions={renderJobActions}
        columns={columns}
      />
    </div>
  );
}
