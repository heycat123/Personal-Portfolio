import { Ban, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, truncateMiddle } from '../utils/formatters';

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke', 'source_alignment_audit'];

export default function JobsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
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

  const loadJobs = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
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
      await loadJobs();
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
      await loadJobs();
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
      await loadJobs();
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

  return (
    <div>
      <PageHeader
        title="Jobs"
        description={`${state.total} job records returned for this case.`}
        actions={
          <>
            <button
              type="button"
              onClick={loadJobs}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
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
                {state.creatingJobType === jobType ? 'Queueing' : `Queue ${jobType}`}
              </button>
            ))}
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadJobs} /></div> : null}
      {state.createError ? <div className="mb-5"><ErrorPanel title="Job creation failed" error={state.createError} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Job action failed" error={state.actionError} /></div> : null}

      <div className="mb-4 flex flex-wrap gap-2">
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

      <DataTable
        rows={state.jobs}
        rowKey={(job) => job.job_id}
        emptyTitle={state.loading ? 'Loading jobs' : 'No jobs returned'}
        columns={[
          {
            key: 'job_type',
            header: 'Type',
            render: (job) => (
              <Link to={`/evidence/cases/${caseId}/jobs/${job.job_id}`} className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">
                {job.job_type}
              </Link>
            ),
          },
          { key: 'status', header: 'Status', render: (job) => <StatusBadge status={job.status} /> },
          { key: 'priority', header: 'Priority', render: (job) => job.priority ?? 0 },
          { key: 'created_at', header: 'Created', render: (job) => formatDateTime(job.created_at) },
          { key: 'started_at', header: 'Started', render: (job) => formatDateTime(job.started_at) },
          { key: 'finished_at', header: 'Finished', render: (job) => formatDateTime(job.finished_at) },
          { key: 'claimed_by_worker_id', header: 'Worker', render: (job) => job.claimed_by_worker_id || 'Not claimed' },
          { key: 'error_class', header: 'Error', render: (job) => job.error_class || 'None' },
          {
            key: 'request_fingerprint_id',
            header: 'Fingerprint',
            render: (job) => truncateMiddle(job.request_fingerprint_id, 24),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (job) => {
              const busy = state.actionJobId === job.job_id;
              const canCancel = job.status === 'queued';
              const canRetry = ['failed', 'cancelled'].includes(job.status) && SAFE_JOB_TYPES.includes(job.job_type);
              return (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cancelJob(job.job_id)}
                    disabled={!canCancel || Boolean(state.actionJobId)}
                    title="Cancel queued job"
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                  >
                    <Ban size={13} aria-hidden="true" />
                    {busy && canCancel ? 'Cancelling' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => retryJob(job.job_id)}
                    disabled={!canRetry || Boolean(state.actionJobId)}
                    title="Retry failed or cancelled safe job"
                    className="inline-flex items-center gap-1 rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    {busy && canRetry ? 'Retrying' : 'Retry'}
                  </button>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
