import { ExternalLink, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function DocumentsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [query, setQuery] = useState('');
  const [state, setState] = useState({
    loading: true,
    error: null,
    documents: [],
    total: 0,
    fingerprint: null,
  });

  const loadDocuments = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocuments(caseId, { limit: 50, offset: 0 }, { token });
      recordFingerprint(result, 'Documents list');
      setState({
        loading: false,
        error: null,
        documents: result.data?.documents || [],
        total: result.data?.total || 0,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDocuments();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return state.documents;
    }

    return state.documents.filter((document) =>
      [
        document.original_filename,
        document.source_provider,
        document.source_of_truth_mode,
        document.status,
        document.extraction_method,
        document.content_hash,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [query, state.documents]);

  return (
    <div>
      <PageHeader
        title="Documents"
        description={`${state.total} document records returned for this case.`}
        actions={
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"
          >
            Upload locked
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDocuments} /></div> : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block max-w-xl flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} aria-hidden="true" />
          <span className="sr-only">Search documents</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search documents"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-sky-500 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:focus:border-sky-400"
          />
        </label>
        {state.fingerprint?.id ? (
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        ) : null}
      </div>

      <DataTable
        rows={filteredDocuments}
        rowKey={(document) => document.file_id}
        emptyTitle={state.loading ? 'Loading documents' : 'No documents matched'}
        columns={[
          {
            key: 'original_filename',
            header: 'File',
            render: (document) => (
              <Link
                to={`/evidence/cases/${caseId}/documents/${document.file_id}`}
                className="inline-flex max-w-md items-center gap-2 font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
              >
                <span className="truncate">{document.original_filename || document.file_id}</span>
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            ),
          },
          { key: 'source_provider', header: 'Source', render: (document) => document.source_provider || 'unknown' },
          { key: 'source_of_truth_mode', header: 'Mode', render: (document) => document.source_of_truth_mode || 'unknown' },
          { key: 'status', header: 'Status', render: (document) => <StatusBadge status={document.status} /> },
          { key: 'page_count', header: 'Pages', render: (document) => document.page_count ?? '0' },
          { key: 'extraction_method', header: 'Extraction', render: (document) => document.extraction_method || 'pending' },
          { key: 'updated_at', header: 'Updated', render: (document) => formatDateTime(document.updated_at || document.created_at) },
          { key: 'content_hash', header: 'Hash', render: (document) => truncateMiddle(document.content_hash, 24) },
        ]}
      />
    </div>
  );
}
