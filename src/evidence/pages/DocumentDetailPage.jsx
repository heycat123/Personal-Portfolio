import { ArrowLeft, FileText, Languages, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function parseLowTextPages(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [value];
    }
  }
  return [value];
}

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

export default function DocumentDetailPage() {
  const { caseId, fileId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { preferences, t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    error: null,
    actionError: null,
    document: null,
    fingerprint: null,
    languageJob: null,
    languageAction: null,
  });

  const loadDocument = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocument(caseId, fileId, { token });
      recordFingerprint(result, 'Document detail');
      setState({
        loading: false,
        error: null,
        actionError: null,
        document: result.data,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
        languageJob: null,
        languageAction: null,
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, fileId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDocument();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDocument]);

  const document = state.document;
  const lowTextPages = useMemo(() => parseLowTextPages(document?.low_text_pages_json), [document]);

  const queueLanguageJob = useCallback(async (jobType) => {
    if (!document?.file_id) {
      return;
    }
    setState((current) => ({ ...current, languageAction: jobType, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createJob(
        caseId,
        {
          job_type: jobType,
          input_json: {
            requested_from: 'document_detail',
            file_id: document.file_id,
            file_hash: document.content_hash,
            target_language: preferences.language || 'en-US',
          },
          priority: 0,
        },
        { token },
      );
      recordFingerprint(result, `Queue ${jobType}`);
      setState((current) => ({
        ...current,
        languageAction: null,
        languageJob: {
          data: result.data,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, languageAction: null, actionError: error }));
    }
  }, [caseId, document?.content_hash, document?.file_id, getAccessToken, preferences.language, recordFingerprint]);

  return (
    <div>
      <PageHeader
        title={document?.original_filename || 'Document Detail'}
        description={document?.file_id || fileId}
        translateTitle={!document?.original_filename}
        translateDescription={false}
        actions={
          <>
            <button
              type="button"
              onClick={() => queueLanguageJob('document_language_detect')}
              disabled={!document || Boolean(state.languageAction)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <Play size={16} aria-hidden="true" />
              {state.languageAction === 'document_language_detect' ? t('Queueing') : t('Queue language detection')}
            </button>
            <button
              type="button"
              onClick={() => queueLanguageJob('document_translation_cache')}
              disabled={!document || Boolean(state.languageAction)}
              className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Languages size={16} aria-hidden="true" />
              {state.languageAction === 'document_translation_cache' ? t('Queueing') : t('Queue translation cache')}
            </button>
            <Link
              to={`/evidence/cases/${caseId}/documents`}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('Documents')}
            </Link>
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDocument} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title={t('Language job failed')} error={state.actionError} /></div> : null}

      {state.fingerprint?.id ? (
        <div className="mb-5">
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        </div>
      ) : null}
      {state.languageJob?.fingerprint?.id ? (
        <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
          <div className="font-semibold">{t('Language job queued')}</div>
          <div className="mt-1 break-words">
            {state.languageJob.data?.job_type || t('Job')} {state.languageJob.data?.job_id ? `| ${state.languageJob.data.job_id}` : ''}
          </div>
          <div className="mt-3">
            <RequestFingerprint
              fingerprintId={state.languageJob.fingerprint.id}
              correlationId={state.languageJob.fingerprint.correlationId}
              label={t('Action fingerprint')}
            />
          </div>
        </div>
      ) : null}

      {document ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricTile icon={FileText} label={t('Pages')} value={document.page_count || 0} detail={t('Reported extraction page count')} />
            <MetricTile label={t('Status')} value={<StatusBadge status={document.status} />} detail={t('Evidence file status')} />
            <MetricTile label={t('Source')} value={document.source_provider || t('unknown')} detail={document.source_of_truth_mode || t('unknown mode')} />
            <MetricTile label={t('Extraction')} value={document.extraction_method || t('pending')} detail={document.media_type || t('unknown media')} />
            <MetricTile
              icon={Languages}
              label={t('Language Layer')}
              value={document.translation_available ? t('Available') : t('Original')}
              detail={formatSummary(document.language_summary, 'No language detection yet', t)}
              tone={document.translation_available ? 'good' : 'info'}
            />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Metadata')}</h3>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                {[
                  ['File ID', document.file_id],
                  ['Version ID', document.current_file_version_id],
                  ['Content Hash', document.content_hash],
                  ['Original Path', document.original_filepath],
                  ['Created', formatDateTime(document.created_at)],
                  ['Updated', formatDateTime(document.updated_at)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not recorded')}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Coverage Flags')}</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Low Text Pages')}</p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {lowTextPages.length ? lowTextPages.map((item) => String(item)).join(', ') : t('None reported')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Graph Status')}</p>
                  <StatusBadge status="unknown" label={t('Pending API route')} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Vector Status')}</p>
                  <StatusBadge status="unknown" label={t('Pending API route')} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Detected Languages')}</p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {formatSummary(document.language_summary, 'No language detection yet', t)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Translation Targets')}</p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {formatSummary(document.translation_summary, 'No translation cache yet', t)}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('Source documents stay in their original language; translations are derived aids.')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Page Extraction Rows')}</h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">{document.pages?.length || 0} {t('row(s)')}</span>
            </div>
            <DataTable
              rows={document.pages || []}
              rowKey={(page) => `${page.page_number}-${page.text_source}`}
              emptyTitle={t('No page extraction rows returned')}
              columns={[
                { key: 'page_number', header: t('Page'), render: (page) => page.page_number },
                { key: 'text_source', header: t('Text Source'), render: (page) => page.text_source || t('unknown') },
                { key: 'page_text_chars', header: t('Characters'), render: (page) => page.page_text_chars ?? 0 },
                {
                  key: 'language_detected',
                  header: t('Detected Language'),
                  render: (page) => page.language_detected || t('Undetected'),
                },
                {
                  key: 'translation_targets',
                  header: t('Translations'),
                  render: (page) => formatTranslationTargets(page.translation_targets, t),
                },
                { key: 'updated_at', header: t('Updated'), render: (page) => formatDateTime(page.updated_at) },
              ]}
            />
          </div>
        </>
      ) : null}

      {!document && state.loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
          {t('Loading document.')}
        </div>
      ) : null}
    </div>
  );
}
