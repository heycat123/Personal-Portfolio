import { LifeBuoy, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, truncateMiddle } from '../utils/formatters';

const RECORD_TYPES = ['', 'idea', 'issue'];
const STATUSES = ['', 'open', 'triaged', 'in_progress', 'closed'];
const CATEGORIES = ['', 'ui', 'api', 'ai', 'ingestion', 'graph', 'billing', 'access', 'other'];

function JsonBlock({ value }) {
  const { t } = useLocaleSettings();
  if (!value || !Object.keys(value).length) {
    return <span className="text-sm text-gray-500 dark:text-gray-400">{t('None')}</span>;
  }
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-gray-100 p-3 text-xs text-gray-800 dark:bg-black/30 dark:text-gray-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function SupportPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [filters, setFilters] = useState({
    record_type: '',
    status: '',
    category: '',
  });
  const [state, setState] = useState({
    loading: true,
    error: null,
    payload: null,
    fingerprint: null,
  });

  const loadSupport = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getSupportRecords(caseId, {
        ...filters,
        limit: 100,
        offset: 0,
      }, { token });
      recordFingerprint(result, 'Support records');
      setState({
        loading: false,
        error: null,
        payload: result.data,
        fingerprint: result.requestFingerprintId,
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, filters, getAccessToken, recordFingerprint]);

  useEffect(() => {
    loadSupport();
  }, [loadSupport]);

  useEffect(() => {
    const handler = () => loadSupport();
    window.addEventListener('evidence-support-record-created', handler);
    return () => window.removeEventListener('evidence-support-record-created', handler);
  }, [loadSupport]);

  const columns = useMemo(() => [
    {
      id: 'record_type',
      header: t('Type'),
      className: 'w-[8%]',
      render: (row) => <StatusBadge status={row.record_type} />,
    },
    {
      id: 'title',
      header: t('Title'),
      className: 'w-[28%]',
      render: (row) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-gray-950 dark:text-white" title={row.title}>{row.title}</div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={row.description}>{row.description}</div>
        </div>
      ),
    },
    {
      id: 'category',
      header: t('Category'),
      className: 'w-[10%]',
      render: (row) => row.category,
    },
    {
      id: 'severity',
      header: t('Severity'),
      className: 'w-[10%]',
      render: (row) => <StatusBadge status={row.severity} />,
    },
    {
      id: 'status',
      header: t('Status'),
      className: 'w-[10%]',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: 'route',
      header: t('Route'),
      className: 'w-[18%]',
      render: (row) => <span title={row.route || ''}>{truncateMiddle(row.route || '-', 44)}</span>,
    },
    {
      id: 'request_fingerprint_id',
      header: t('Fingerprint'),
      className: 'w-[14%]',
      render: (row) => row.request_fingerprint_id ? truncateMiddle(row.request_fingerprint_id, 30) : '-',
    },
    {
      id: 'created_at',
      header: t('Created'),
      className: 'w-[12%]',
      render: (row) => formatDateTime(row.created_at),
    },
  ], [t]);

  const rows = state.payload?.records || [];
  const scope = state.payload?.scope || 'own';

  return (
    <div>
      <PageHeader
        title="Support"
        description="Ideas and issue reports captured with case, route, browser, and request-fingerprint context."
        actions={(
          <button
            type="button"
            onClick={loadSupport}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t('Refresh')}
          </button>
        )}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Support records failed" error={state.error} onRetry={loadSupport} /></div> : null}

      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <LifeBuoy size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Support Queue')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {scope === 'admin' ? t('Scope: admin can see all case records.') : t('Scope: showing records created by you.')}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
            <select
              value={filters.record_type}
              onChange={(event) => setFilters((current) => ({ ...current, record_type: event.target.value }))}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
            >
              {RECORD_TYPES.map((value) => <option key={value || 'all'} value={value}>{value || t('all types')}</option>)}
            </select>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
            >
              {STATUSES.map((value) => <option key={value || 'all'} value={value}>{value || t('all statuses')}</option>)}
            </select>
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
            >
              {CATEGORIES.map((value) => <option key={value || 'all'} value={value}>{value || t('all categories')}</option>)}
            </select>
          </div>
        </div>
      </section>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey="support_record_id"
        loading={state.loading}
        emptyTitle={state.loading ? t('Loading support records') : t('No support records found')}
        renderDetailPanel={(row) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Description')}</div>
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{row.description}</p>
              {row.impact ? (
                <>
                  <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Impact')}</div>
                  <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{row.impact}</p>
                </>
              ) : null}
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Fingerprint')}</div>
                <RequestFingerprint fingerprintId={row.request_fingerprint_id} compact />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Initial triage')}</div>
                <JsonBlock value={row.triage_json || {}} />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Context')}</div>
                <JsonBlock value={row.context_json || {}} />
              </div>
            </div>
          </div>
        )}
        mobileTitle={(row) => row.title}
        mobileSubtitle={(row) => `${row.record_type} / ${row.category} / ${formatDateTime(row.created_at)}`}
        mobileMetrics={(row) => [
          { id: 'severity', header: t('Severity'), render: () => <StatusBadge status={row.severity} /> },
          { id: 'status', header: t('Status'), render: () => <StatusBadge status={row.status} /> },
          { id: 'fingerprint', header: t('Fingerprint'), render: () => truncateMiddle(row.request_fingerprint_id || '-', 28) },
        ]}
      />

      {state.fingerprint ? (
        <div className="mt-4">
          <RequestFingerprint fingerprintId={state.fingerprint} label={t('Support latest')} />
        </div>
      ) : null}
    </div>
  );
}
