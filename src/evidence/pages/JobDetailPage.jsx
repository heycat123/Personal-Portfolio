import { ArrowLeft, Ban, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
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
import { formatDateTime } from '../utils/formatters';
import { isDocumentProcessingRequest, jobDisplayTitle, jobProgressModel } from '../utils/jobProgress';

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke', 'source_alignment_audit', 'agentic_quality_test'];

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
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { isRootAdmin } = useOperatorMode();
  const [state, setState] = useState({
    loading: true,
    actionLoading: null,
    error: null,
    actionError: null,
    job: null,
    fingerprint: null,
  });

  const loadJob = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getJob(caseId, jobId, { token });
      recordFingerprint(result, 'Job detail');
      setState({
        loading: false,
        error: null,
        job: result.data,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
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
      await loadJob();
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setState((current) => ({ ...current, actionLoading: null }));
    }
  }, [caseId, getAccessToken, jobId, loadJob, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadJob();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadJob]);

  const job = state.job;
  const progress = job ? jobProgressModel(job) : null;
  const canCancel = Boolean(progress?.canCancel);
  const canRetry = job && ['failed', 'cancelled'].includes(job.status) && SAFE_JOB_TYPES.includes(job.job_type);
  const isProcessingRequest = isDocumentProcessingRequest(job);
  const costText = progress ? formatJobCost(progress.costSummary) : null;
  const costDetail = progress?.costSummary?.hasPaidCost
    ? progress.costSummary?.actualUsd !== null && progress.costSummary?.actualUsd !== undefined
      ? t('Actual cost')
      : progress.costSummary?.estimatedUsd !== null && progress.costSummary?.estimatedUsd !== undefined
        ? t('Estimated cost')
        : t(progress.costSummary?.message || 'Cost recorded for this job.')
    : t(progress?.costSummary?.message || 'No paid cost recorded for this job.');

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
              onClick={loadJob}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} aria-hidden="true" />
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
                  <ProgressMeter
                    value={progress.progressPercent}
                    label={t(progress.progressLabel)}
                    detail={t('{percent}% processed. {meaning}', { percent: progress.progressPercent, meaning: progress.progressText })}
                    className="mt-3 max-w-lg"
                  />
                  {isProcessingRequest ? (
                    <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
                      {t('Processing readiness means the app can search and cite the document. It does not mean the document is legally complete, admissible, sufficient, or ready for court.')}
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label={t('Status')}
              value={<StatusBadge status={progress.badgeStatus} label={t(progress.statusLabel)} />}
              detail={t('Request workflow status')}
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

          <div className="mt-6 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div>
              <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Events')}</h3>
              <JobStatusTimeline events={job.events || []} />
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Input')}</h3>
                <JsonBlock value={job.input_json} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Result')}</h3>
                <JsonBlock value={job.result_json} />
              </div>
              {job.error_message_redacted ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                  {job.error_message_redacted}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {!job && state.loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
          {t('Loading job.')}
        </div>
      ) : null}
    </div>
  );
}
