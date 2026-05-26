import { Activity, Database, GitCompare, Play, Server } from 'lucide-react';
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
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

export default function HealthPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    error: null,
    caseHealth: null,
    storageHealth: null,
    graphHealth: null,
    queueHealth: null,
    sourceAlignment: null,
    rawParity: null,
    smokeResult: null,
    smokeError: null,
    smokeRunning: false,
    alignmentJob: null,
    alignmentJobError: null,
    alignmentJobRunning: false,
    fingerprints: [],
  });

  const loadHealth = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const token = await getAccessToken();
    const results = await Promise.allSettled([
      evidenceApi.getCaseHealth(caseId, { token }),
      evidenceApi.getStorageHealth(caseId, { token }),
      evidenceApi.getRawParity(caseId, { token }),
      evidenceApi.getGraphHealth(caseId, { token }),
      evidenceApi.getQueueHealth(caseId, { token }),
      evidenceApi.getSourceAlignmentLatest(caseId, { token }),
    ]);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const labels = ['Case health', 'Storage health', 'Raw parity', 'Graph health', 'Queue health', 'Source alignment'];
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
      graphHealth: fulfilledValue(results[3])?.data || null,
      queueHealth: fulfilledValue(results[4])?.data || null,
      sourceAlignment: fulfilledValue(results[5])?.data || null,
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

  const queueSourceAlignmentAudit = useCallback(async () => {
    setState((current) => ({ ...current, alignmentJobRunning: true, alignmentJobError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createJob(
        caseId,
        {
          job_type: 'source_alignment_audit',
          input_json: {
            requested_from: 'health_page',
            mode: 'read_only',
            cloud_neo4j: true,
            scan_google_drive_api: true,
          },
          priority: 0,
        },
        { token },
      );
      recordFingerprint(result, 'Queue source alignment audit');
      setState((current) => ({
        ...current,
        alignmentJobRunning: false,
        alignmentJob: {
          data: result.data,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, alignmentJobRunning: false, alignmentJobError: error }));
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
  const graph = state.graphHealth || state.caseHealth?.graph;
  const queue = state.queueHealth || state.caseHealth?.queue || {};
  const graphError = graph?.error_message || graph?.reason;
  const graphCaseTotals = graph?.case_totals || {};
  const vectorCoverage = graph?.chunk_embedding_coverage || {};
  const parentGaps = graph?.child_parent_link_gaps || {};
  const vectorIndexes = graph?.vector_indexes || [];
  const childChunks = vectorCoverage.child_chunks || 0;
  const embeddedChildChunks = vectorCoverage.embedded_child_chunks || 0;
  const missingChildEmbeddings = vectorCoverage.missing_child_embeddings || 0;
  const missingParentEdges = parentGaps.missing_parent_edges || 0;
  const vectorOk = Boolean(graph?.ok && childChunks > 0 && missingChildEmbeddings === 0 && missingParentEdges === 0);
  const rawTables = state.rawParity?.tables || [];
  const sourceAlignment = state.sourceAlignment;
  const alignmentRows = Object.entries(sourceAlignment?.comparisons || {}).map(([name, comparison]) => ({
    name,
    ...comparison,
  }));
  const alignmentGapCount = alignmentRows.filter((row) => !row.skipped && row.ok === false).length;
  const alignmentAvailable = Boolean(sourceAlignment?.available);
  const alignmentOk = Boolean(alignmentAvailable && sourceAlignment?.strict_alignment_ok);

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
              {t('Refresh')}
            </button>
            <button
              type="button"
              onClick={runStorageSmoke}
              disabled={state.smokeRunning}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              {state.smokeRunning ? t('Running') : t('Run S3 smoke')}
            </button>
            <button
              type="button"
              onClick={queueSourceAlignmentAudit}
              disabled={state.alignmentJobRunning}
              className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              {state.alignmentJobRunning ? t('Queueing') : t('Queue alignment check')}
            </button>
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadHealth} /></div> : null}
      {state.smokeError ? <div className="mb-5"><ErrorPanel title="Storage smoke failed" error={state.smokeError} /></div> : null}
      {state.alignmentJobError ? <div className="mb-5"><ErrorPanel title="Alignment job failed" error={state.alignmentJobError} /></div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricTile
          icon={Database}
          label="Postgres"
          value={database?.ok ? t('Online') : state.loading ? t('Checking') : t('Unknown')}
          detail={database?.database_name || t('No database payload')}
          tone={database?.ok ? 'good' : 'warn'}
        />
        <MetricTile
          icon={Server}
          label="S3"
          value={storage?.ok ? t('Configured') : state.loading ? t('Checking') : t('Unknown')}
          detail={storage?.bucket || storage?.reason || t('No bucket returned')}
          tone={storage?.ok ? 'good' : 'warn'}
        />
        <MetricTile
          icon={Activity}
          label="Graph"
          value={
            <StatusBadge
              status={graph?.ok ? 'online' : graph?.configured ? 'offline' : 'unknown'}
              label={graph?.ok ? t('Online') : graph?.configured ? t('Offline') : t('Not configured')}
            />
          }
          detail={
            graph?.ok
              ? t('{nodes} case nodes, {relationships} case relationships', { nodes: graphCaseTotals.nodes || 0, relationships: graphCaseTotals.relationships || 0 })
              : graphError || t('No Neo4j payload returned')
          }
          tone={graph?.ok ? 'good' : graph?.configured ? 'bad' : 'warn'}
        />
        <MetricTile
          icon={Activity}
          label="Queue"
          value={
            <StatusBadge
              status={queue.rabbitmq?.ok && queue.redis?.ok ? 'online' : queue.rabbitmq?.configured || queue.redis?.configured ? 'degraded' : 'unknown'}
              label={queue.rabbitmq?.ok && queue.redis?.ok ? t('Ready') : queue.rabbitmq?.configured || queue.redis?.configured ? t('Check') : t('Not configured')}
            />
          }
          detail={
            queue.rabbitmq?.ok && queue.redis?.ok
              ? t('{queue} has {count} message(s); Redis ping OK', { queue: queue.rabbitmq.queue, count: queue.rabbitmq.message_count || 0 })
              : queue.rabbitmq?.error_message || queue.redis?.error_message || queue.rabbitmq?.reason || t('Queue health not returned')
          }
          tone={queue.rabbitmq?.ok && queue.redis?.ok ? 'good' : queue.rabbitmq?.configured || queue.redis?.configured ? 'warn' : 'default'}
        />
        <MetricTile
          icon={Activity}
          label="Vectors"
          value={
            <StatusBadge
              status={vectorOk ? 'online' : graph?.ok ? 'degraded' : 'unknown'}
              label={vectorOk ? t('Covered') : graph?.ok ? t('Check coverage') : t('Waiting')}
            />
          }
          detail={
            graph?.ok
              ? t('{embedded}/{total} child chunks embedded; {missing} missing parent edges; {indexes} vector index row(s)', { embedded: embeddedChildChunks, total: childChunks, missing: missingParentEdges, indexes: vectorIndexes.length })
              : t('Connect Neo4j before vector coverage can be shown.')
          }
          tone={vectorOk ? 'good' : graph?.ok ? 'warn' : 'default'}
        />
        <MetricTile
          icon={GitCompare}
          label="Source Proof"
          value={
            <StatusBadge
              status={alignmentOk ? 'online' : alignmentAvailable ? 'degraded' : 'unknown'}
              label={alignmentOk ? t('Aligned') : alignmentAvailable ? t('Gaps found') : t('No manifest')}
            />
          }
          detail={
            alignmentAvailable
              ? t('{count} strict gap(s); finished {time}', { count: alignmentGapCount, time: formatDateTime(sourceAlignment.audit_finished_at) })
              : sourceAlignment?.reason || t('Run source_alignment_audit.py to generate a proof manifest.')
          }
          tone={alignmentOk ? 'good' : alignmentAvailable ? 'warn' : 'default'}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Raw Table Coverage')}</h3>
          <DataTable
            rows={rawTables}
            rowKey={(table) => table.name}
            emptyTitle={t('No raw parity rows returned')}
            columns={[
              { key: 'name', header: t('Table'), render: (table) => table.name },
              { key: 'postgres_rows', header: t('Postgres Rows'), render: (table) => table.postgres_rows },
            ]}
          />

          <div className="mt-6">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Source Alignment Proof')}</h3>
            {alignmentAvailable ? (
              <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={alignmentOk ? 'succeeded' : 'degraded'} label={alignmentOk ? t('Strict alignment passed') : t('Strict alignment has gaps')} />
                  <span className="text-gray-600 dark:text-gray-400">
                    {sourceAlignment.stores?.local_source?.unique_hash_count || 0} local hashes,
                    {' '}
                    {sourceAlignment.stores?.sqlite?.document_extractions || 0} SQLite hashes,
                    {' '}
                    {sourceAlignment.stores?.google_drive_api?.unique_hash_count || 0} Drive hashes,
                    {' '}
                    {sourceAlignment.stores?.neo4j?.chunk_hashes || 0} graph chunk hashes
                  </span>
                </div>
                {sourceAlignment.recommendations?.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
                    {sourceAlignment.recommendations.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                {sourceAlignment?.reason || t('No source alignment manifest has been published by the API runtime.')}
              </div>
            )}
            <DataTable
              rows={alignmentRows}
              rowKey={(row) => row.name}
              emptyTitle={t('No source alignment rows returned')}
              toolbar={(
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                  {t('Each row compares a reference hash set to a target hash set. Missing means the hash exists in the reference but not the target. Extra means the hash exists in the target but not the reference. Hover the Missing or Extra number for row-specific meaning.')}
                </div>
              )}
              columns={[
                {
                  key: 'name',
                  header: t('Comparison'),
                  render: (row) => (
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-950 dark:text-white">{t(row.label || row.name.replaceAll('_', ' '))}</div>
                      <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {t('Reference')}: {t(row.reference_label || 'Reference hash set')}
                        {' | '}
                        {t('Compared to')}: {t(row.target_label || 'Target hash set')}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'ok',
                  header: t('Status'),
                  render: (row) => (
                    <StatusBadge
                      status={row.skipped ? 'unknown' : row.ok ? 'succeeded' : 'failed'}
                      label={row.skipped ? t('Skipped') : row.ok ? t('OK') : t('Gap')}
                    />
                  ),
                },
                {
                  key: 'missing_count',
                  header: t('Missing'),
                  render: (row) => (
                    <span title={t(row.missing_meaning || 'Hash exists in the reference set but not the target set.')}>
                      {row.missing_count ?? '-'}
                    </span>
                  ),
                },
                {
                  key: 'extra_count',
                  header: t('Extra'),
                  render: (row) => (
                    <span title={t(row.extra_meaning || 'Hash exists in the target set but not the reference set.')}>
                      {row.extra_count ?? '-'}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Storage Details')}</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ['Bucket', storage?.bucket],
                ['Region', storage?.region],
                ['Smoke Prefix', storage?.smoke_prefix],
                  ['Configured', storage?.configured ? t('yes') : t('no')],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                  <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not returned')}</dd>
                </div>
              ))}
            </dl>
          </div>

          {state.smokeResult ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Latest Smoke')}</h3>
                <StatusBadge status={state.smokeResult.data?.ok ? 'succeeded' : 'failed'} />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Key', state.smokeResult.data?.key],
                  ['ETag', state.smokeResult.data?.etag],
                  ['Encryption', state.smokeResult.data?.server_side_encryption],
                  ['Deleted', state.smokeResult.data?.deleted ? t('yes') : t('no')],
                  ['Created', formatDateTime(state.smokeResult.data?.created_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not returned')}</dd>
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

          {state.alignmentJob ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Latest Alignment Job')}</h3>
                <StatusBadge status={state.alignmentJob.data?.job?.status || 'queued'} />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Job ID', state.alignmentJob.data?.job?.job_id],
                  ['Type', state.alignmentJob.data?.job?.job_type],
                  ['Status', state.alignmentJob.data?.job?.status],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not returned')}</dd>
                  </div>
                ))}
              </dl>
              {state.alignmentJob.data?.job?.job_id ? (
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${state.alignmentJob.data.job.job_id}`}
                  className="mt-3 inline-flex rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                >
                  {t('Open job')}
                </Link>
              ) : null}
              {state.alignmentJob.fingerprint?.id ? (
                <div className="mt-4">
                  <RequestFingerprint
                    fingerprintId={state.alignmentJob.fingerprint.id}
                    correlationId={state.alignmentJob.fingerprint.correlationId}
                    compact
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Request Fingerprints')}</h3>
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
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('No health fingerprints captured yet.')}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
