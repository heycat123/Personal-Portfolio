import { Activity, Database, Play, Server } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import MetricTile from '../components/MetricTile';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

export default function HealthPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [state, setState] = useState({
    loading: true,
    error: null,
    caseHealth: null,
    storageHealth: null,
    rawParity: null,
    smokeResult: null,
    smokeError: null,
    smokeRunning: false,
    fingerprints: [],
  });

  const loadHealth = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const token = await getAccessToken();
    const results = await Promise.allSettled([
      evidenceApi.getCaseHealth(caseId, { token }),
      evidenceApi.getStorageHealth(caseId, { token }),
      evidenceApi.getRawParity(caseId, { token }),
    ]);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const labels = ['Case health', 'Storage health', 'Raw parity'];
        recordFingerprint(result.value, labels[index]);
      }
    });

    const firstError = results.find((result) => result.status === 'rejected')?.reason || null;
    setState((current) => ({
      ...current,
      loading: false,
      error: firstError,
      caseHealth: fulfilledValue(results[0])?.data || null,
      storageHealth: fulfilledValue(results[1])?.data || null,
      rawParity: fulfilledValue(results[2])?.data || null,
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

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadHealth();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadHealth]);

  const database = state.caseHealth?.database;
  const storage = state.storageHealth || state.caseHealth?.storage;
  const rawTables = state.rawParity?.tables || [];

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
              Refresh
            </button>
            <button
              type="button"
              onClick={runStorageSmoke}
              disabled={state.smokeRunning}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              {state.smokeRunning ? 'Running' : 'Run S3 smoke'}
            </button>
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadHealth} /></div> : null}
      {state.smokeError ? <div className="mb-5"><ErrorPanel title="Storage smoke failed" error={state.smokeError} /></div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Database}
          label="Postgres"
          value={database?.ok ? 'Online' : state.loading ? 'Checking' : 'Unknown'}
          detail={database?.database_name || 'No database payload'}
          tone={database?.ok ? 'good' : 'warn'}
        />
        <MetricTile
          icon={Server}
          label="S3"
          value={storage?.ok ? 'Configured' : state.loading ? 'Checking' : 'Unknown'}
          detail={storage?.bucket || storage?.reason || 'No bucket returned'}
          tone={storage?.ok ? 'good' : 'warn'}
        />
        <MetricTile
          icon={Activity}
          label="Graph"
          value={<StatusBadge status="unknown" label="Pending route" />}
          detail="Neo4j health route is planned for later Phase 7."
        />
        <MetricTile
          icon={Activity}
          label="Vectors"
          value={<StatusBadge status="unknown" label="Pending route" />}
          detail="Vector coverage route is planned for later Phase 7."
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">Raw Table Coverage</h3>
          <DataTable
            rows={rawTables}
            rowKey={(table) => table.name}
            emptyTitle="No raw parity rows returned"
            columns={[
              { key: 'name', header: 'Table', render: (table) => table.name },
              { key: 'postgres_rows', header: 'Postgres Rows', render: (table) => table.postgres_rows },
            ]}
          />
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">Storage Details</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ['Bucket', storage?.bucket],
                ['Region', storage?.region],
                ['Smoke Prefix', storage?.smoke_prefix],
                ['Configured', storage?.configured ? 'yes' : 'no'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || 'Not returned'}</dd>
                </div>
              ))}
            </dl>
          </div>

          {state.smokeResult ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Latest Smoke</h3>
                <StatusBadge status={state.smokeResult.data?.ok ? 'succeeded' : 'failed'} />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Key', state.smokeResult.data?.key],
                  ['ETag', state.smokeResult.data?.etag],
                  ['Encryption', state.smokeResult.data?.server_side_encryption],
                  ['Deleted', state.smokeResult.data?.deleted ? 'yes' : 'no'],
                  ['Created', formatDateTime(state.smokeResult.data?.created_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{label}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || 'Not returned'}</dd>
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

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">Request Fingerprints</h3>
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
                <p className="text-sm text-gray-600 dark:text-gray-400">No health fingerprints captured yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
