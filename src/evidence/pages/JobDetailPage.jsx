import { ArrowLeft, Ban, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import JobStatusTimeline from '../components/JobStatusTimeline';
import MetricTile from '../components/MetricTile';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke'];

function JsonBlock({ value }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-900 dark:border-gray-800 dark:bg-[#0c1218] dark:text-gray-100">
      {JSON.stringify(value || {}, null, 2)}
    </pre>
  );
}

export default function JobDetailPage() {
  const { caseId, jobId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
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
  const canCancel = job?.status === 'queued';
  const canRetry = job && ['failed', 'cancelled'].includes(job.status) && SAFE_JOB_TYPES.includes(job.job_type);

  return (
    <div>
      <PageHeader
        title={job?.job_type || 'Job Detail'}
        description={job?.job_id || jobId}
        actions={
          <>
            <button
              type="button"
              onClick={loadJob}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={cancelJob}
              disabled={!canCancel || Boolean(state.actionLoading)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <Ban size={16} aria-hidden="true" />
              {state.actionLoading === 'cancel' ? 'Cancelling' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={retryJob}
              disabled={!canRetry || Boolean(state.actionLoading)}
              className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={16} aria-hidden="true" />
              {state.actionLoading === 'retry' ? 'Retrying' : 'Retry'}
            </button>
            <Link
              to={`/evidence/cases/${caseId}/jobs`}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Jobs
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Status" value={<StatusBadge status={job.status} />} detail="Current worker state" />
            <MetricTile label="Priority" value={job.priority ?? 0} detail="Higher priority runs first" />
            <MetricTile label="Created" value={formatDateTime(job.created_at)} detail={job.created_by_user_id || 'No user recorded'} />
            <MetricTile label="Worker" value={job.claimed_by_worker_id || 'Not claimed'} detail={job.error_class || 'No error class'} />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div>
              <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">Events</h3>
              <JobStatusTimeline events={job.events || []} />
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">Input</h3>
                <JsonBlock value={job.input_json} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">Result</h3>
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
          Loading job.
        </div>
      ) : null}
    </div>
  );
}
