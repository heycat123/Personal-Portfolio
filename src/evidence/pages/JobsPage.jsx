import { Play, RefreshCw } from 'lucide-react';
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

const SAFE_JOB_TYPES = ['noop', 's3_storage_smoke'];

export default function JobsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [state, setState] = useState({
    loading: true,
    creatingJobType: null,
    error: null,
    createError: null,
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
    setState((current) => ({ ...current, creatingJobType: jobType, createError: null }));
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
        ]}
      />
    </div>
  );
}
