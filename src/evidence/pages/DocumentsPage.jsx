import { ExternalLink, FileText, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

const PAGE_SIZE = 50;

function formatSummary(summary, fallback, t) {
  const entries = Object.entries(summary || {}).filter(([, count]) => Number(count) > 0);
  if (!entries.length) {
    return t(fallback);
  }
  return entries.map(([label, count]) => `${label}: ${count}`).join(', ');
}

function formatTranslationTargets(targets, t) {
  if (!Array.isArray(targets) || !targets.length) {
    return t('None reported');
  }
  const counts = targets.reduce((accumulator, target) => {
    const language = target?.target_language || 'unknown';
    accumulator[language] = (accumulator[language] || 0) + 1;
    return accumulator;
  }, {});
  return Object.entries(counts).map(([language, count]) => `${language}: ${count}`).join(', ');
}

export default function DocumentsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [queryDraft, setQueryDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sort, setSort] = useState({ key: 'updated_at', desc: true });
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({
    loading: true,
    error: null,
    documents: [],
    total: 0,
    fingerprint: null,
  });
  const [drawer, setDrawer] = useState({
    open: false,
    loading: false,
    error: null,
    document: null,
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

  const openDocumentDrawer = useCallback(async (document) => {
    if (!document?.file_id) {
      return;
    }
    setDrawer({
      open: true,
      loading: true,
      error: null,
      document,
      fingerprint: null,
    });
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocument(caseId, document.file_id, { token });
      recordFingerprint(result, 'Document drawer detail');
      setDrawer({
        open: true,
        loading: false,
        error: null,
        document: result.data || document,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setDrawer((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const closeDocumentDrawer = () => {
    setDrawer((current) => ({ ...current, open: false }));
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE_SIZE));
  const canGoPrevious = offset > 0;
  const canGoNext = offset + PAGE_SIZE < state.total;

  const documentColumns = useMemo(() => ([
    {
      key: 'original_filename',
      header: t('File'),
      headerClassName: 'w-[36%]',
      className: 'min-w-0',
      help: t('The file name recorded for this evidence item. Click the name for the document detail page; click the row for the drawer.'),
      render: (document) => (
        <Link
          to={`/evidence/cases/${caseId}/documents/${document.file_id}`}
          className="flex max-w-full min-w-0 items-center gap-2 font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
          title={document.original_filename || document.file_id}
        >
          <span className="min-w-0 truncate">{document.original_filename || document.file_id}</span>
          <ExternalLink className="shrink-0" size={14} aria-hidden="true" />
        </Link>
      ),
    },
    {
      key: 'origin_label',
      header: t('Origin'),
      headerClassName: 'w-[14%]',
      help: t('Where the item originally came from, such as Google Drive, web upload, or a communication export.'),
      render: (document) => document.origin_label || 'unknown',
    },
    {
      key: 'evidence_type_label',
      header: t('Evidence Type'),
      headerClassName: 'w-[14%]',
      help: t('What kind of evidence this is. This is separate from where the file came from.'),
      render: (document) => document.evidence_type_label || 'Document',
    },
    {
      key: 'canonical_storage_label',
      header: t('Storage'),
      headerClassName: 'w-[14%]',
      help: t('Whether Evidence AI has an S3 canonical copy or this is still a legacy local import that needs S3 sync.'),
      render: (document) => document.canonical_storage_label || 'unknown',
    },
    { key: 'status', header: t('Status'), headerClassName: 'w-[9%]', render: (document) => <StatusBadge status={document.status} /> },
    { key: 'page_count', header: t('Pages'), headerClassName: 'w-[7%]', filterType: 'number', render: (document) => document.page_count ?? '0' },
    { key: 'updated_at', header: t('Updated'), headerClassName: 'w-[12%]', render: (document) => formatDateTime(document.updated_at || document.created_at) },
  ]), [caseId, t]);

  const filteredDocuments = useMemo(() => {
    const activeFilters = Object.entries(filterValues || {}).filter(([, value]) => String(value || '').trim());
    const rows = state.documents.filter((document) =>
      activeFilters.every(([key, value]) => {
        const needle = String(value || '').trim().toLowerCase();
        if (!needle) {
          return true;
        }
        const raw = document[key];
        if (key === 'page_count') {
          return Number(raw || 0) >= Number(value || 0);
        }
        return String(raw ?? '').toLowerCase().includes(needle);
      }),
    );
    const sortKey = sort?.key;
    if (!sortKey) {
      return rows;
    }
    return [...rows].sort((left, right) => {
      const leftValue = left[sortKey] ?? '';
      const rightValue = right[sortKey] ?? '';
      if (sortKey === 'page_count') {
        return (Number(leftValue || 0) - Number(rightValue || 0)) * (sort.desc ? -1 : 1);
      }
      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * (sort.desc ? -1 : 1);
    });
  }, [filterValues, sort, state.documents]);

  const appliedFilters = useMemo(() =>
    Object.entries(filterValues || {})
      .filter(([, value]) => String(value || '').trim())
      .map(([key, value]) => {
        const column = documentColumns.find((candidate) => candidate.key === key);
        return { id: key, label: `${column?.header || key}: ${value}` };
      }), [documentColumns, filterValues]);

  const clearColumnFilter = (columnId) => {
    setFilterValues((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Documents"
        description={`${state.total} ${t('document records')}${appliedQuery ? ` ${t('matching')} "${appliedQuery}"` : ''}.`}
        actions={
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"
          >
            {t('Upload locked')}
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDocuments} /></div> : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex max-w-2xl flex-1 flex-col gap-2 sm:flex-row">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} aria-hidden="true" />
            <span className="sr-only">{t('Search documents')}</span>
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder={t('Search all documents')}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-sky-500 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:focus:border-sky-400"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            {t('Search')}
          </button>
          {appliedQuery ? (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              {t('Clear')}
            </button>
          ) : null}
        </form>
        {state.fingerprint?.id ? (
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        ) : null}
      </div>

      <DataTable
        rows={filteredDocuments}
        rowKey={(document) => document.file_id}
        loading={state.loading}
        emptyTitle={state.loading ? t('Loading documents') : t('No documents matched')}
        enableHeaderMenus
        filterValues={filterValues}
        sort={sort}
        onFilterChange={(columnId, value) => setFilterValues((current) => ({ ...current, [columnId]: value }))}
        onClearFilter={clearColumnFilter}
        onClearAllFilters={() => setFilterValues({})}
        onSort={(columnId, desc) => setSort({ key: columnId, desc })}
        appliedFilters={appliedFilters}
        sortLabel={sort?.key ? `${t('Sorted by')} ${documentColumns.find((column) => column.key === sort.key)?.header || sort.key} (${sort.desc ? t('Descending') : t('Ascending')})` : null}
        selectedRowKey={drawer.open ? drawer.document?.file_id : null}
        onRowSelect={openDocumentDrawer}
        mobileTitle={(document) => (
          <Link
            to={`/evidence/cases/${caseId}/documents/${document.file_id}`}
            className="font-semibold text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
          >
            {document.original_filename || document.file_id}
          </Link>
        )}
        mobileSubtitle={(document) => `${document.origin_label || 'unknown'} | ${document.evidence_type_label || 'Document'} | ${document.status || 'unknown'}`}
        mobileActions={(document) => (
          <Link to={`/evidence/cases/${caseId}/documents/${document.file_id}`} className="text-gray-400 hover:text-sky-700 dark:hover:text-sky-300" title={t('Open document detail page')}>
            <ExternalLink size={15} aria-hidden="true" />
          </Link>
        )}
        columns={documentColumns}
      />

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {t('Page {page} of {pages}', { page: currentPage, pages: totalPages })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            disabled={!canGoPrevious || state.loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            {t('Previous')}
          </button>
          <button
            type="button"
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
            disabled={!canGoNext || state.loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            {t('Next')}
          </button>
        </div>
      </div>

      {drawer.open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('Close document preview')}
            onClick={closeDocumentDrawer}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute bottom-0 right-0 top-0 flex w-screen max-w-full flex-col overflow-x-hidden border-l border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw] sm:max-w-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#101820]">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                  {drawer.document?.original_filename || t('Document Preview')}
                </div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{drawer.document?.file_id || t('Loading document')}</div>
              </div>
              <button
                type="button"
                onClick={closeDocumentDrawer}
                className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="h-full overflow-auto overflow-x-hidden p-3 sm:p-4">
              {drawer.error ? <div className="mb-4"><ErrorPanel title="Document preview failed" error={drawer.error} /></div> : null}
              {drawer.fingerprint?.id ? (
                <div className="mb-4">
                  <RequestFingerprint fingerprintId={drawer.fingerprint.id} correlationId={drawer.fingerprint.correlationId} label={t('Preview fingerprint')} />
                </div>
              ) : null}

              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold text-gray-950 dark:text-white">
                      {drawer.document?.original_filename || drawer.document?.file_id}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {drawer.loading ? t('Loading current document metadata.') : drawer.document?.original_filepath || t('No original path recorded.')}
                    </p>
                  </div>
                  <StatusBadge status={drawer.document?.status || 'unknown'} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Pages')}</div>
                    <div className="text-gray-950 dark:text-white">{drawer.document?.page_count ?? '0'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Origin')}</div>
                    <div className="break-words text-gray-950 dark:text-white">{drawer.document?.origin_label || 'unknown'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Evidence Type')}</div>
                    <div className="break-words text-gray-950 dark:text-white">{drawer.document?.evidence_type_label || 'Document'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Storage')}</div>
                    <div className="break-words text-gray-950 dark:text-white">{drawer.document?.canonical_storage_label || 'unknown'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Language')}</div>
                    <div className="break-words text-gray-950 dark:text-white">
                      {formatSummary(drawer.document?.language_summary, 'No language detection yet', t)}
                    </div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Translations')}</div>
                    <div className="break-words text-gray-950 dark:text-white">
                      {formatSummary(drawer.document?.translation_summary, 'No translation cache yet', t)}
                    </div>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    [t('Updated'), formatDateTime(drawer.document?.updated_at || drawer.document?.created_at)],
                    [t('Content Hash'), drawer.document?.content_hash],
                    [t('Version ID'), drawer.document?.current_file_version_id],
                    [t('Media Type'), drawer.document?.media_type],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{label}</dt>
                      <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not recorded')}</dd>
                    </div>
                  ))}
                </dl>

                <Link
                  to={`/evidence/cases/${caseId}/documents/${drawer.document?.file_id}`}
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                >
                  <FileText size={16} aria-hidden="true" />
                  {t('Open document details')}
                </Link>
              </section>

              <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Page Extraction Rows')}</h3>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('{size} rows', { size: drawer.document?.pages?.length || 0 })}</span>
                </div>
                <DataTable
                  rows={drawer.document?.pages || []}
                  rowKey={(page) => `${page.page_number}-${page.text_source}`}
                  emptyTitle={drawer.loading ? t('Loading page rows') : t('No page rows returned')}
                  columns={[
                    { key: 'page_number', header: t('Page'), render: (page) => page.page_number },
                    { key: 'text_source', header: t('Text Source'), render: (page) => page.text_source || 'unknown' },
                    { key: 'page_text_chars', header: t('Characters'), render: (page) => page.page_text_chars ?? 0 },
                    { key: 'language_detected', header: t('Detected Language'), render: (page) => page.language_detected || t('Undetected') },
                    { key: 'translation_targets', header: t('Translations'), render: (page) => formatTranslationTargets(page.translation_targets, t) },
                    { key: 'updated_at', header: t('Updated'), render: (page) => formatDateTime(page.updated_at) },
                  ]}
                />
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
