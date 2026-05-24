import { Activity, Briefcase, Database, FileText, MessageSquare, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import MetricTile from '../components/MetricTile';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, sumCounts, truncateMiddle } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

export default function DashboardPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [state, setState] = useState({
    loading: true,
    error: null,
    summary: null,
    health: null,
    jobs: null,
    fingerprints: [],
  });

  const loadDashboard = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const token = await getAccessToken();
    const results = await Promise.allSettled([
      evidenceApi.getCaseSummary(caseId, { token }),
      evidenceApi.getCaseHealth(caseId, { token }),
      evidenceApi.getJobs(caseId, { limit: 5, offset: 0 }, { token }),
    ]);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const labels = ['Case summary', 'Case health', 'Latest jobs'];
        recordFingerprint(result.value, labels[index]);
      }
    });

    const firstError = results.find((result) => result.status === 'rejected')?.reason || null;
    setState({
      loading: false,
      error: firstError,
      summary: fulfilledValue(results[0])?.data || null,
      health: fulfilledValue(results[1])?.data || null,
      jobs: fulfilledValue(results[2])?.data || null,
      fingerprints: results
        .filter((result) => result.status === 'fulfilled' && result.value.requestFingerprintId)
        .map((result) => ({
          id: result.value.requestFingerprintId,
          correlationId: result.value.correlationId,
        })),
    });
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDashboard]);

  const counts = state.summary?.counts || state.health?.summary?.counts || {};
  const latestJobs = state.jobs?.jobs || [];

  return (
    <div>
      <PageHeader
        title="Case Dashboard"
        description="Live read-only case status from the Evidence API."
        actions={
          <button
            type="button"
            onClick={loadDashboard}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            Refresh
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDashboard} /></div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={FileText} label="Documents" value={counts.evidence_files || 0} detail="Evidence file records" />
        <MetricTile icon={Database} label="Pages" value={counts.document_pages || 0} detail="Extracted page rows" tone="info" />
        <MetricTile icon={MessageSquare} label="Messages" value={counts.communication_messages || 0} detail="Communication rows" />
        <MetricTile
          icon={Users}
          label="Entities"
          value={sumCounts(counts, ['canonical_people', 'person_aliases', 'entity_mentions'])}
          detail="People, aliases, and mentions"
        />
        <MetricTile icon={Activity} label="API Requests" value={counts.api_requests || 0} detail="Logged fingerprints" />
        <MetricTile icon={Briefcase} label="Jobs" value={state.jobs?.total || 0} detail="Case-scoped background work" />
        <MetricTile
          icon={Database}
          label="Database"
          value={state.health?.database?.ok ? 'Online' : state.loading ? 'Checking' : 'Unknown'}
          tone={state.health?.database?.ok ? 'good' : 'warn'}
          detail={state.health?.database?.database_name || 'No database payload'}
        />
        <MetricTile
          icon={Activity}
          label="S3 Storage"
          value={state.health?.storage?.ok ? 'Configured' : state.loading ? 'Checking' : 'Unknown'}
          tone={state.health?.storage?.ok ? 'good' : 'warn'}
          detail={state.health?.storage?.bucket || state.health?.storage?.reason || 'No storage payload'}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">Latest Jobs</h3>
            <Link to={`/evidence/cases/${caseId}/jobs`} className="text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100">
              View all
            </Link>
          </div>
          <DataTable
            rows={latestJobs}
            rowKey={(job) => job.job_id}
            emptyTitle="No jobs returned"
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
              { key: 'created_at', header: 'Created', render: (job) => formatDateTime(job.created_at) },
              {
                key: 'request_fingerprint_id',
                header: 'Fingerprint',
                render: (job) => truncateMiddle(job.request_fingerprint_id, 24),
              },
            ]}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Request Fingerprints</h3>
          <div className="mt-3 space-y-2">
            {state.fingerprints.length ? (
              state.fingerprints.map((fingerprint) => (
                <RequestFingerprint
                  key={fingerprint.id}
                  fingerprintId={fingerprint.id}
                  correlationId={fingerprint.correlationId}
                  compact
                />
              ))
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">No successful request fingerprint captured yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
