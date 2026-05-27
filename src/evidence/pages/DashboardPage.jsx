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
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, sumCounts, truncateMiddle } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

export default function DashboardPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
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
    const requests = [
      { key: 'summary', label: 'Case summary', promise: evidenceApi.getCaseSummary(caseId, { token }) },
    ];
    if (canSeeOperations) {
      requests.push(
        { key: 'health', label: 'Case health', promise: evidenceApi.getCaseHealth(caseId, { token }) },
        { key: 'jobs', label: 'Latest jobs', promise: evidenceApi.getJobs(caseId, { limit: 5, offset: 0 }, { token }) },
      );
    }
    const results = await Promise.allSettled(requests.map((request) => request.promise));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        recordFingerprint(result.value, requests[index].label);
      }
    });
    const fulfilledByKey = Object.fromEntries(
      requests.map((request, index) => [request.key, fulfilledValue(results[index])?.data || null]),
    );

    const firstError = results.find((result) => result.status === 'rejected')?.reason || null;
    setState({
      loading: false,
      error: firstError,
      summary: fulfilledByKey.summary || null,
      health: fulfilledByKey.health || null,
      jobs: fulfilledByKey.jobs || null,
      fingerprints: results
        .filter((result) => result.status === 'fulfilled' && result.value.requestFingerprintId)
        .map((result) => ({
          id: result.value.requestFingerprintId,
          correlationId: result.value.correlationId,
        })),
    });
  }, [canSeeOperations, caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDashboard]);

  const counts = state.summary?.counts || state.health?.summary?.counts || {};
  const latestJobs = state.jobs?.jobs || [];
  const graph = state.health?.graph || {};
  const vectorCoverage = graph.chunk_embedding_coverage || {};
  const parentGaps = graph.child_parent_link_gaps || {};
  const childChunks = vectorCoverage.child_chunks || 0;
  const embeddedChildChunks = vectorCoverage.embedded_child_chunks || 0;
  const missingChildEmbeddings = vectorCoverage.missing_child_embeddings || 0;
  const missingParentEdges = parentGaps.missing_parent_edges || 0;
  const vectorOk = Boolean(graph.ok && childChunks > 0 && missingChildEmbeddings === 0 && missingParentEdges === 0);
  const documentFiles = counts.document_files || counts.document_extractions || 0;
  const syncedExtractedFiles = counts.extracted_files_synced_to_s3 || 0;
  const missingS3Files = counts.extracted_files_missing_s3 || 0;
  const s3CoverageOk = Boolean(documentFiles > 0 && missingS3Files === 0);

  return (
    <div>
      <PageHeader
        title="Case Dashboard"
        description={canSeeOperations ? 'Live case status from the Evidence API.' : 'Search, review, and organize the evidence available in this case.'}
        actions={
          <button
            type="button"
            onClick={loadDashboard}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            {t('Refresh')}
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDashboard} /></div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={FileText} label={t('Documents')} value={documentFiles} detail={t('Unique extracted source files')} />
        <MetricTile icon={Database} label={t('Pages')} value={counts.document_pages || 0} detail={t('Extracted page rows')} tone="info" />
        {canSeeOperations ? <MetricTile
          icon={Activity}
          label="Cloud Copy Coverage"
          value={`${syncedExtractedFiles}/${documentFiles}`}
          tone={s3CoverageOk ? 'good' : documentFiles ? 'warn' : 'default'}
          detail={documentFiles ? `${missingS3Files} extracted files still need cloud-copy proof` : 'No extracted files counted yet'}
        /> : null}
        <MetricTile icon={MessageSquare} label={t('Messages')} value={counts.communication_messages || 0} detail="Communication rows" />
        <MetricTile
          icon={Users}
          label={t('Entities')}
          value={sumCounts(counts, ['canonical_people', 'person_aliases', 'entity_mentions'])}
          detail={t('People, aliases, and mentions')}
        />
        {canSeeOperations ? <MetricTile icon={Activity} label={t('API Requests')} value={counts.api_requests || 0} detail="Logged fingerprints" /> : null}
        {canSeeOperations ? <MetricTile icon={Briefcase} label={t('Jobs')} value={state.jobs?.total || 0} detail={t('Case-scoped background work')} /> : null}
        {canSeeOperations ? <MetricTile
          icon={Database}
          label={t('Database')}
          value={state.health?.database?.ok ? 'Online' : state.loading ? 'Checking' : 'Unknown'}
          tone={state.health?.database?.ok ? 'good' : 'warn'}
          detail={state.health?.database?.database_name || 'No database payload'}
        /> : null}
        {canSeeOperations ? <MetricTile
          icon={Activity}
          label="Cloud Storage"
          value={state.health?.storage?.ok ? 'Configured' : state.loading ? 'Checking' : 'Unknown'}
          tone={state.health?.storage?.ok ? 'good' : 'warn'}
          detail={state.health?.storage?.bucket || state.health?.storage?.reason || 'No storage payload'}
        /> : null}
        {canSeeOperations ? <MetricTile
          icon={Activity}
          label={t('Graph')}
          value={graph.ok ? 'Online' : state.loading ? 'Checking' : 'Unknown'}
          tone={graph.ok ? 'good' : graph.configured ? 'bad' : 'warn'}
          detail={graph.ok ? `${graph.case_totals?.nodes || 0} case nodes` : graph.error_message || graph.reason || 'No graph payload'}
        /> : null}
        {canSeeOperations ? <MetricTile
          icon={Activity}
          label={t('Vectors')}
          value={vectorOk ? 'Covered' : graph.ok ? 'Review' : 'Unknown'}
          tone={vectorOk ? 'good' : graph.ok ? 'warn' : 'default'}
          detail={graph.ok ? `${embeddedChildChunks}/${childChunks} child chunks embedded` : 'Graph connection required'}
        /> : null}
      </div>

      {canSeeOperations || debugEnabled ? <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {canSeeOperations ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Latest Jobs')}</h3>
            <Link to={`/evidence/cases/${caseId}/jobs`} className="text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100">
              {t('View all')}
            </Link>
          </div>
          <DataTable
            rows={latestJobs}
            rowKey={(job) => job.job_id}
            emptyTitle={t('No jobs returned')}
            columns={[
              {
                key: 'job_type',
                header: t('Type'),
                render: (job) => (
                  <Link to={`/evidence/cases/${caseId}/jobs/${job.job_id}`} className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">
                    {job.job_type}
                  </Link>
                ),
              },
              { key: 'status', header: t('Status'), render: (job) => <StatusBadge status={job.status} /> },
              { key: 'created_at', header: t('Created'), render: (job) => formatDateTime(job.created_at) },
              {
                key: 'request_fingerprint_id',
                header: t('Fingerprint'),
                render: (job) => truncateMiddle(job.request_fingerprint_id, 24),
              },
            ]}
          />
        </div>
        ) : null}

        {debugEnabled ? <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Request Fingerprints')}</h3>
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
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('No successful request fingerprint captured yet.')}</p>
            )}
          </div>
        </div> : null}
      </div> : null}
    </div>
  );
}
