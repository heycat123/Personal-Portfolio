import { ArrowLeft, ExternalLink, FileText, Headphones, Languages, Play, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import DocumentPreviewPanel from '../components/DocumentPreviewPanel';
import DocumentRemovalDialog from '../components/DocumentRemovalDialog';
import ErrorPanel from '../components/ErrorPanel';
import MetricTile from '../components/MetricTile';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import TranscriptPanel from '../components/TranscriptPanel';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { removalResultDetail } from '../utils/documentRemoval';
import {
  detectedLanguageLabel,
  hasTranscript,
  mediaKind,
  mediaKindLabel,
  transcriptPages,
  transcriptionMethod,
} from '../utils/documentMedia';
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

function factorLabel(code, t) {
  if (!code) {
    return t('No issue tag');
  }
  if (code === 'review_needed') {
    return t('Review suggested issue tag');
  }
  return String(code).toUpperCase();
}

function issueTagReviewState(document, t) {
  const pipeline = document?.pipeline_status || {};
  const graphStatus =
    document?.pipeline_display?.relationship_map?.status ||
    pipeline.graph ||
    document?.graph_status ||
    'pending';
  const queryStatus = document?.query_readiness?.status;

  if (queryStatus === 'not_ready') {
    return {
      label: t('Source/text review needed'),
      description: t('Evidence AI has a source record, but the file is not ready for search yet. Confirm the source copy or extracted text before relying on it in Ask Documents.'),
    };
  }

  if (graphStatus === 'complete') {
    return {
      label: t('No issue tags suggested'),
      description: t('Processing finished, but no parenting, time-sharing, financial, or court-file issue tag was suggested.'),
    };
  }

  return {
    label: t('Issue tags pending'),
    description: t('Search and people/contact processing has not finished for this document yet. This is not a manual legal review task.'),
  };
}

function FactorTags({ document, t }) {
  const codes = Array.isArray(document?.issue_tag_codes)
    ? document.issue_tag_codes
    : Array.isArray(document?.legal_factor_codes)
      ? document.legal_factor_codes
      : [];
  const suggestedTags = Array.isArray(document?.organizational_issue_tags) ? document.organizational_issue_tags : [];
  if (!codes.length) {
    const state = issueTagReviewState(document, t);
    return <span className="text-sm text-gray-600 dark:text-gray-400" title={state.description}>{state.label}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => {
        const suggested = suggestedTags.find((tag) => tag.issue_tag_code === code);
        const title = suggested?.display_label || suggested?.issue_tag_label || factorLabel(code, t);
        return (
          <span key={code} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-900 dark:border-indigo-900/70 dark:bg-indigo-950/50 dark:text-indigo-100" title={title}>
            {code === 'review_needed' ? t('Review tag') : String(code).toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

export default function DocumentDetailPage() {
  const { caseId, fileId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { preferences, t } = useLocaleSettings();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
  const [state, setState] = useState({
    loading: true,
    error: null,
    actionError: null,
    document: null,
    fingerprint: null,
    languageJob: null,
    languageAction: null,
    previewLoading: false,
    previewError: null,
    previewUrl: null,
    previewContentType: null,
    removalBusy: false,
    removalError: null,
    removalJob: null,
    removalMessage: null,
    removalDialogOpen: false,
  });

  const loadDocument = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocument(caseId, fileId, { token });
      recordFingerprint(result, 'Document detail');
      const document = result.data;
      setState({
        loading: false,
        error: null,
        actionError: null,
        document,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
        languageJob: null,
        languageAction: null,
        previewLoading: Boolean(document?.s3_key),
        previewError: null,
        previewUrl: null,
        previewContentType: null,
        removalBusy: false,
        removalError: null,
        removalJob: null,
        removalMessage: null,
        removalDialogOpen: false,
      });
      if (document?.s3_key) {
        try {
          const previewResult = await evidenceApi.previewDocument(caseId, fileId, { token });
          recordFingerprint(previewResult, 'Document raw preview');
          const previewUrl = URL.createObjectURL(previewResult.blob);
          setState((current) => ({
            ...current,
            previewLoading: false,
            previewError: null,
            previewUrl,
            previewContentType: previewResult.contentType,
          }));
        } catch (previewError) {
          setState((current) => ({ ...current, previewLoading: false, previewError }));
        }
      }
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

  useEffect(() => () => {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
    }
  }, [state.previewUrl]);

  const document = state.document;
  const lowTextPages = useMemo(() => parseLowTextPages(document?.low_text_pages_json), [document]);
  const showDiagnostics = canSeeOperations || debugEnabled;
  const documentKind = mediaKind(document || {}, state.previewContentType);
  const isMediaTranscriptDocument = documentKind === 'audio' || documentKind === 'video';
  const transcriptAvailable = hasTranscript(document || {});
  const transcriptRecords = transcriptPages(document || {});
  const documentTypeLabel = mediaKindLabel(document || {}, state.previewContentType);
  const documentTypeIcon = documentKind === 'audio' ? Headphones : documentKind === 'video' ? Video : FileText;

  const scrollToTranscript = useCallback(() => {
    document?.file_id && window.requestAnimationFrame(() => {
      window.document.getElementById('document-transcript')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [document?.file_id]);

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

  const openRemovalDialog = useCallback(() => {
    if (!document?.file_id || state.removalBusy) {
      return;
    }
    setState((current) => ({
      ...current,
      removalDialogOpen: true,
      removalError: null,
      removalJob: null,
      removalMessage: null,
    }));
  }, [document?.file_id, state.removalBusy]);

  const closeRemovalDialog = useCallback(() => {
    if (state.removalBusy) {
      return;
    }
    setState((current) => ({ ...current, removalDialogOpen: false }));
  }, [state.removalBusy]);

  const excludeDocumentFromProcessing = useCallback(async (removalPayload) => {
    if (!document?.file_id || state.removalBusy) {
      return;
    }
    if (!removalPayload) {
      return;
    }
    setState((current) => ({
      ...current,
      removalBusy: true,
      removalError: null,
      removalJob: null,
      removalMessage: null,
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.excludeDocument(
        caseId,
        document.file_id,
        removalPayload,
        { token },
      );
      recordFingerprint(result, 'Exclude document from processing');
      await loadDocument();
      setState((current) => ({
        ...current,
        removalBusy: false,
        removalError: null,
        removalJob: result.data,
        removalMessage: removalResultDetail(result.data, removalPayload, t, document.original_filename || document.file_id),
        removalDialogOpen: false,
      }));
    } catch (error) {
      setState((current) => ({ ...current, removalBusy: false, removalError: error }));
    }
  }, [caseId, document?.file_id, document?.original_filename, getAccessToken, loadDocument, recordFingerprint, state.removalBusy, t]);

  return (
    <div>
      <PageHeader
        title={document?.original_filename || 'Document Detail'}
        description={document
          ? t('{type} file details, preview, and transcript/search status.', { type: t(documentTypeLabel) })
          : t('Loading document details.')}
        translateTitle={!document?.original_filename}
        actions={
          <>
            {isMediaTranscriptDocument ? (
              <button
                type="button"
                onClick={scrollToTranscript}
                disabled={!transcriptAvailable}
                className="inline-flex items-center gap-2 rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800 dark:bg-[#101820] dark:text-sky-200 dark:hover:bg-sky-950/40"
              >
                <FileText size={16} aria-hidden="true" />
                {t('View transcript')}
              </button>
            ) : null}
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
            <button
              type="button"
              onClick={openRemovalDialog}
              disabled={!document || state.removalBusy}
              className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/30"
              title={t('Choose soft remove or delete the secure workspace copy. The original source file is not deleted.')}
            >
              <Trash2 size={16} aria-hidden="true" />
              {state.removalBusy ? t('Removing') : t('Remove from workspace')}
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

      {showDiagnostics && state.fingerprint?.id ? (
        <div className="mb-5">
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        </div>
      ) : null}
      {showDiagnostics && state.languageJob?.fingerprint?.id ? (
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
      {state.removalError ? <div className="mb-5"><ErrorPanel title={t('Exclude action failed')} error={state.removalError} /></div> : null}
      {state.removalJob ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="font-semibold">{t(state.removalJob.display_status || 'Removed from workspace')}</div>
          <div className="mt-1 break-words">
            {state.removalMessage || ''}
          </div>
        </div>
      ) : null}

      {document ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricTile icon={documentTypeIcon} label={t('Type')} value={t(documentTypeLabel)} detail={document.media_type || t('unknown media')} />
            <MetricTile icon={FileText} label={isMediaTranscriptDocument ? t('Transcript records') : t('Pages')} value={isMediaTranscriptDocument ? transcriptRecords.length : (document.page_count || 0)} detail={isMediaTranscriptDocument ? t('Transcript records available for review') : t('Reported extraction page count')} />
            <MetricTile label={t('Status')} value={<StatusBadge status={document.status} />} detail={t('Evidence file status')} />
            <MetricTile label={t('Source')} value={document.source_provider || t('unknown')} detail={document.source_of_truth_mode || t('unknown mode')} />
            <MetricTile label={t('Extraction')} value={isMediaTranscriptDocument ? t('Transcript') : (document.extraction_method || t('pending'))} detail={transcriptionMethod(document) || document.media_type || t('unknown media')} />
            <MetricTile
              icon={Languages}
              label={t('Language Layer')}
              value={document.translation_available ? t('Available') : t('Original')}
              detail={t(detectedLanguageLabel(document))}
              tone={document.translation_available ? 'good' : 'info'}
            />
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Source file preview')}</h3>
              {document.s3_key ? <StatusBadge status="configured" label={t('Secure workspace copy')} /> : <StatusBadge status="degraded" label={t('No secure copy')} />}
            </div>
            {state.previewLoading ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('Loading source file preview...')}</p>
            ) : (
              <DocumentPreviewPanel
                previewUrl={state.previewUrl}
                previewError={state.previewError}
                contentType={state.previewContentType || document.media_type}
                fileName={document.original_filename}
                document={document}
                maxHeightClass="max-h-[70vh]"
              />
            )}
            {isMediaTranscriptDocument && transcriptAvailable ? (
              <button
                type="button"
                onClick={scrollToTranscript}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              >
                <FileText size={16} aria-hidden="true" />
                {t('View transcript')}
              </button>
            ) : null}
          </div>

          {isMediaTranscriptDocument ? (
            <div className="mt-6">
              <TranscriptPanel document={document} id="document-transcript" />
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{showDiagnostics ? t('Support details') : t('Source details')}</h3>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                {[
                  ['Original Path', document.original_filepath],
                  ['File Size', document.content_length ? `${document.content_length} ${t('bytes')}` : null],
                  ['Created', formatDateTime(document.created_at)],
                  ['Updated', formatDateTime(document.updated_at)],
                  ...(showDiagnostics ? [
                    ['File ID', document.file_id],
                    ['Version ID', document.current_file_version_id],
                    ['Content Hash', document.content_hash],
                    ['Drive File ID', document.source_details?.drive_file_id],
                    ['Drive MD5', document.source_details?.drive_md5],
                    ['Storage key', document.s3_key],
                  ] : []),
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(label)}</dt>
                    <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not recorded')}</dd>
                  </div>
                ))}
              </dl>
              {document.source_details?.drive_web_view_link ? (
                <a
                  href={document.source_details.drive_web_view_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                  {t('Open in Google Drive')}
                </a>
              ) : null}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Review status')}</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Pages needing text review')}</p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {lowTextPages.length ? lowTextPages.map((item) => String(item)).join(', ') : t('None reported')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Relationship links')}</p>
                  <StatusBadge status={document.graph_status || 'pending'} label={document.graph_status || t('pending')} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Search readiness')}</p>
                  <StatusBadge status={document.vector_status || 'pending'} label={document.vector_status || t('pending')} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Issue tags')}</p>
                  <div className="mt-1"><FactorTags document={document} t={t} /></div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Detected Languages')}</p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {t(detectedLanguageLabel(document))}
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
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{isMediaTranscriptDocument ? t('Transcript records') : t('Pages / extracted text')}</h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {document.pages?.length || 0} {isMediaTranscriptDocument ? t('record(s)') : t('page(s)')}
              </span>
            </div>
            <DataTable
              rows={document.pages || []}
              rowKey={(page) => `${page.page_number}-${page.text_source}`}
              emptyTitle={t('No page text returned')}
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
      <DocumentRemovalDialog
        busy={state.removalBusy}
        documentName={document?.original_filename || document?.file_id}
        hasSecureWorkspaceCopy={Boolean(document?.s3_key)}
        onClose={closeRemovalDialog}
        onConfirm={excludeDocumentFromProcessing}
        open={Boolean(state.removalDialogOpen)}
      />
    </div>
  );
}
