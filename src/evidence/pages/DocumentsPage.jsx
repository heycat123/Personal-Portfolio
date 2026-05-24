import { ExternalLink, Search } from 'lucide-react';
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

const PAGE_SIZE = 50;

export default function DocumentsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [queryDraft, setQueryDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [offset, setOffset] = useState(0);
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
      const result = await evidenceApi.getDocuments(
        caseId,
        { limit: PAGE_SIZE, offset, q: appliedQuery },
        { token },
      );
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
  }, [appliedQuery, caseId, getAccessToken, offset, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDocuments();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDocuments]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setOffset(0);
    setAppliedQuery(queryDraft.trim());
  };

  const clearSearch = () => {
    setQueryDraft('');
    setAppliedQuery('');
    setOffset(0);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE_SIZE));
  const canGoPrevious = offset > 0;
  const canGoNext = offset + PAGE_SIZE < state.total;

  return (
    <div>
      <PageHeader
        title="Documents"
        description={`${state.total} document records${appliedQuery ? ` matching "${appliedQuery}"` : ''}.`}
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
        <form onSubmit={handleSearchSubmit} className="flex max-w-2xl flex-1 flex-col gap-2 sm:flex-row">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} aria-hidden="true" />
            <span className="sr-only">Search documents</span>
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Search all documents"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-sky-500 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:focus:border-sky-400"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            Search
          </button>
          {appliedQuery ? (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              Clear
            </button>
          ) : null}
        </form>
        {state.fingerprint?.id ? (
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        ) : null}
      </div>

      <DataTable
        rows={state.documents}
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

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            disabled={!canGoPrevious || state.loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
            disabled={!canGoNext || state.loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
