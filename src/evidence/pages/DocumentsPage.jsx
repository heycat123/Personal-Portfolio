import { CheckCircle2, ChevronDown, Download, ExternalLink, FileText, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CategoryReviewPanel from '../components/CategoryReviewPanel';
import DataTable from '../components/DataTable';
import DocumentPreviewPanel from '../components/DocumentPreviewPanel';
import DocumentRemovalDialog from '../components/DocumentRemovalDialog';
import ErrorPanel from '../components/ErrorPanel';
import NeedsAttentionPanel from '../components/NeedsAttentionPanel';
import PageHeader from '../components/PageHeader';
import PipelineReadinessDonut from '../components/PipelineReadinessDonut';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import TranscriptPanel from '../components/TranscriptPanel';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { isActiveJob } from '../hooks/useJobStatusPolling';
import { evidenceApi } from '../services/evidenceApi';
import { buildCaseAttentionItems, filterAttentionItems } from '../utils/caseAttention';
import { removalResultDetail } from '../utils/documentRemoval';
import { documentPipelineItems, documentUserStatusForJobState } from '../utils/documentStatus';
import {
  detectedLanguageLabel,
  hasTranscript,
  isAudioDocument,
  isVideoDocument,
  mediaKind,
  mediaKindLabel,
  transcriptPages,
} from '../utils/documentMedia';
import { formatDateTime } from '../utils/formatters';
import { isDocumentProcessingRequest } from '../utils/jobProgress';

const PAGE_SIZE = 25;
const DEFAULT_SORT = { key: 'updated_at', desc: true };
const DEFAULT_PROCESSING_FILTER = '';
const DEFAULT_CATEGORY_QA_LENS_ID = 'florida_relocation_best_interest';
const DOCUMENT_JOB_SOCKET_START_TIMEOUT_MS = 8000;
const STATUTE_FACTOR_OPTIONS = [
  { value: '7a', label: '61.13001(7)(a) - relationship and involvement' },
  { value: '7b', label: '61.13001(7)(b) - age and developmental needs' },
  { value: '7c', label: '61.13001(7)(c) - preserving relationship with nonrelocating parent' },
  { value: '7d', label: '61.13001(7)(d) - child preference' },
  { value: '7e', label: '61.13001(7)(e) - quality of life' },
  { value: '7f', label: '61.13001(7)(f) - reasons and good faith' },
  { value: '7g', label: '61.13001(7)(g) - employment and economic circumstances' },
  { value: '7h', label: '61.13001(7)(h) - good-faith compliance' },
  { value: '7i', label: '61.13001(7)(i) - career and other opportunities' },
  { value: '7j', label: '61.13001(7)(j) - domestic violence or substance abuse' },
  { value: '7k', label: '61.13001(7)(k) - other best-interest factors' },
  ...'abcdefghijklmnopqrst'.split('').map((letter) => ({
    value: `3${letter}`,
    label: `61.13(3)(${letter}) - parenting-plan best-interest factor`,
  })),
];
const FACTOR_LABELS = Object.fromEntries(STATUTE_FACTOR_OPTIONS.map((item) => [item.value, item.label]));

function normalizeDocumentStatusFilter(value) {
  const status = String(value || '').toLowerCase().replace(/\s+/g, '_');
  if (['ready', 'ready_for_search', 'succeeded', 'complete', 'completed'].includes(status)) {
    return 'ready';
  }
  if (['processing', 'not_processed', 'pending', 'queued', 'running', 'in_progress'].includes(status)) {
    return 'processing';
  }
  if (['partial', 'partially_ready', 'needs_finish', 'needs_follow_up'].includes(status)) {
    return 'partial';
  }
  if (['failed', 'error', 'needs_attention', 'blocked'].includes(status)) {
    return 'failed';
  }
  return '';
}

function normalizePropagationSubstageFilter(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, '_');
}

function factorLabel(code, t) {
  if (!code) {
    return t('No issue tag');
  }
  if (code === 'review_needed') {
    return t('Review suggested issue tag');
  }
  return FACTOR_LABELS[code] || code.toUpperCase();
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
      tone: 'amber',
      description: t('Evidence AI has a source record, but the file is not ready for search yet. Confirm the source copy or extracted text before relying on it in Ask Documents.'),
    };
  }

  if (graphStatus === 'complete') {
    return {
      label: t('No issue tags suggested'),
      tone: 'gray',
      description: t('Processing finished, but no parenting, time-sharing, financial, or court-file issue tag was suggested.'),
    };
  }

  return {
    label: t('Issue tags pending'),
    tone: 'sky',
    description: t('Search and people/contact processing has not finished for this document yet. This is not a manual legal review task.'),
  };
}

function FactorTags({ document, t, compact = false }) {
  const codes = Array.isArray(document?.issue_tag_codes)
    ? document.issue_tag_codes
    : Array.isArray(document?.legal_factor_codes)
      ? document.legal_factor_codes
      : [];
  const suggestedTags = Array.isArray(document?.organizational_issue_tags) ? document.organizational_issue_tags : [];
  if (!codes.length) {
    const state = issueTagReviewState(document, t);
    const toneClass = state.tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100'
      : state.tone === 'sky'
        ? 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100'
        : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-black/20 dark:text-gray-200';
    return (
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass}`}
        title={state.description}
      >
        {state.label}
      </span>
    );
  }
  const visibleCodes = compact ? codes.slice(0, 3) : codes;
  return (
    <div className="flex flex-wrap gap-1">
      {visibleCodes.map((code) => {
        const suggested = suggestedTags.find((tag) => tag.issue_tag_code === code);
        const title = suggested?.display_label || suggested?.issue_tag_label || factorLabel(code, t);
        return (
          <span key={code} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-900 dark:border-indigo-900/70 dark:bg-indigo-950/50 dark:text-indigo-100" title={title}>
            {code === 'review_needed' ? t('Review tag') : code.toUpperCase()}
          </span>
        );
      })}
      {compact && codes.length > visibleCodes.length ? (
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-black/20 dark:text-gray-200">
          +{codes.length - visibleCodes.length}
        </span>
      ) : null}
    </div>
  );
}

function documentsTableStorageKey(caseId) {
  return `evidence.documents.table.${caseId || 'default'}`;
}

function readStoredDocumentsTableState(caseId) {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(documentsTableStorageKey(caseId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readUrlDocumentsTableState(searchParams) {
  const next = {};
  const filterValues = {};
  const query = String(searchParams.get('q') || '').trim();
  const fileName = String(searchParams.get('file_name') || searchParams.get('original_filename') || '').trim();
  const fileIds = String(searchParams.get('file_ids') || '').trim();
  const origin = String(searchParams.get('origin') || '').trim();
  const evidenceType = String(searchParams.get('evidence_type') || '').trim();
  const storageStatus = String(searchParams.get('storage_status') || '').trim();
  const factorCode = String(searchParams.get('factor_code') || '').trim();
  const pipelineStatus = String(searchParams.get('pipeline_status') || '').trim();
  const processingStatus = normalizeDocumentStatusFilter(
    searchParams.get('propagation_bucket')
    || searchParams.get('status')
    || searchParams.get('user_status')
    || searchParams.get('processing_status'),
  );
  const propagationSubstage = normalizePropagationSubstageFilter(searchParams.get('propagation_substage'));
  if (query) {
    next.appliedQuery = query;
  }
  if (fileName) {
    filterValues.original_filename = fileName;
  }
  if (fileIds) {
    filterValues.file_ids = fileIds;
  }
  if (origin) {
    filterValues.origin_label = origin;
  }
  if (evidenceType) {
    filterValues.evidence_type_label = evidenceType;
  }
  if (storageStatus) {
    filterValues.canonical_storage_label = storageStatus;
  }
  if (factorCode) {
    filterValues.legal_factor_code = factorCode;
  }
  if (pipelineStatus) {
    filterValues.pipeline_status = pipelineStatus;
  }
  if (processingStatus) {
    filterValues.processing_status = processingStatus;
  }
  if (propagationSubstage) {
    filterValues.propagation_substage = propagationSubstage;
  }
  if (Object.keys(filterValues).length) {
    next.filterValues = filterValues;
    next.offset = 0;
  }
  return next;
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

function documentKindLabel(document, contentType = '') {
  return mediaKindLabel(document || {}, contentType);
}

function documentTextSectionLabel(document, t) {
  const kind = mediaKind(document || {});
  return kind === 'audio' || kind === 'video' ? t('Transcript records') : t('Pages / extracted text');
}

function statusText(status) {
  return String(status || 'pending').replace(/_/g, ' ');
}

function categoryReviewFilterValues(category) {
  if (!category) {
    return {};
  }
  if (category.kind === 'document_category') {
    return {
      evidence_type_label: category.label || category.code || category.category_id,
    };
  }
  if (category.code) {
    return {
      legal_factor_code: String(category.code).toLowerCase(),
    };
  }
  return {};
}

function categoryReviewExportQuery(category, sort) {
  const filters = categoryReviewFilterValues(category);
  return {
    ...(filters.evidence_type_label ? { evidence_type: filters.evidence_type_label } : {}),
    ...(filters.legal_factor_code ? { factor_code: filters.legal_factor_code } : {}),
    sort_by: sort?.key || 'updated_at',
    sort_dir: sort?.desc ? 'desc' : 'asc',
  };
}

function exportToken(value) {
  return String(value || 'documents')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'documents';
}

function PipelineDots({ document, showLabels = false, t = (value) => value }) {
  const items = documentPipelineItems(document);
  if (!showLabels) {
    return (
      <PipelineReadinessDonut items={items} size={28} t={t} />
    );
  }
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-black/20">
          <span className="inline-flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100">
            <PipelineReadinessDonut items={[item]} size={20} t={t} />
            {item.label}
          </span>
          <span className="capitalize text-gray-600 dark:text-gray-300">{statusText(item.status)}</span>
        </div>
      ))}
    </div>
  );
}

function DocumentRowStatus({ document, hasActiveProcessingJob, t }) {
  const status = documentUserStatusForJobState(document, { hasActiveProcessingJob });
  return (
    <div className="flex min-w-[9rem] items-center gap-2" title={t(status.description)} aria-label={t(status.accessibilityLabel || status.description)}>
      <span className={`h-10 w-1.5 rounded-full ${status.barClassName}`} aria-hidden="true" />
      <StatusBadge status={status.badgeStatus} label={t(status.label)} />
    </div>
  );
}

function facetOptions(facets, key) {
  return (facets?.[key] || []).map((item) => ({
    value: item.value,
    label: item.label || item.value,
    count: item.count,
  }));
}

function originCount(facets, matcher) {
  return facetOptions(facets, 'origin_label').reduce((total, option) => (
    matcher(String(option.label || option.value || '').toLowerCase())
      ? total + Number(option.count || 0)
      : total
  ), 0);
}

function readableSourceLabel(value) {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ');
  if (!normalized) {
    return 'Unknown source';
  }
  if (normalized.includes('one drive') || normalized.includes('onedrive')) {
    return 'OneDrive';
  }
  if (normalized.includes('google') || normalized === 'drive') {
    return 'Google Drive';
  }
  if (normalized.includes('dropbox')) {
    return 'Dropbox';
  }
  if (normalized.includes('web upload')) {
    return 'Web upload';
  }
  if (normalized.includes('upload')) {
    return 'Upload';
  }
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceItemCount(item) {
  if (typeof item === 'number') {
    return item;
  }
  return Number(
    item?.unique_hashes
    ?? item?.unique_documents
    ?? item?.canonical_documents
    ?? item?.document_count
    ?? item?.documents
    ?? item?.count
    ?? item?.total
    ?? 0,
  );
}

function documentSourceComposition(facets, canonicalDocumentRollup = null) {
  const byLabel = new Map();
  const addSource = ({ key, label, count, filterValue }) => {
    const numericCount = Number(count || 0);
    if (!numericCount) {
      return;
    }
    const displayLabel = readableSourceLabel(label || key || filterValue);
    const id = displayLabel.toLowerCase();
    if (byLabel.has(id)) {
      return;
    }
    byLabel.set(id, {
      key: key || id,
      label: displayLabel,
      count: numericCount,
      filterValue: filterValue || label || displayLabel,
    });
  };

  const rollupSources = canonicalDocumentRollup?.source_composition
    || canonicalDocumentRollup?.sources
    || canonicalDocumentRollup?.by_source
    || canonicalDocumentRollup?.source_counts
    || canonicalDocumentRollup?.providers;
  if (Array.isArray(rollupSources)) {
    rollupSources.forEach((item, index) => {
      const key = item?.key || item?.source || item?.provider || item?.origin || item?.id || `source_${index}`;
      addSource({
        key,
        label: item?.label || item?.source_label || item?.provider_label || item?.origin_label || key,
        count: sourceItemCount(item),
        filterValue: item?.filter_value || item?.origin_label || item?.value || item?.source || item?.provider,
      });
    });
  } else if (rollupSources && typeof rollupSources === 'object') {
    Object.entries(rollupSources).forEach(([key, value]) => {
      addSource({
        key,
        label: value?.label || value?.source_label || value?.provider_label || value?.origin_label || key,
        count: sourceItemCount(value),
        filterValue: value?.filter_value || value?.origin_label || value?.value || key,
      });
    });
  }

  [
    ['google_drive', canonicalDocumentRollup?.google_drive],
    ['web_upload', canonicalDocumentRollup?.web_upload],
    ['upload', canonicalDocumentRollup?.upload],
    ['one_drive', canonicalDocumentRollup?.one_drive],
    ['dropbox', canonicalDocumentRollup?.dropbox],
  ].forEach(([key, value]) => {
    addSource({
      key,
      label: key,
      count: sourceItemCount(value),
      filterValue: readableSourceLabel(key),
    });
  });

  facetOptions(facets, 'origin_label').forEach((option) => {
    addSource({
      key: option.value || option.label,
      label: option.label || option.value,
      count: option.count,
      filterValue: option.value || option.label,
    });
  });

  return Array.from(byLabel.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function DocumentSourcesStrip({ caseId, facets, canonicalDocumentRollup = null, t, canManageSources = false }) {
  const googleDriveCount = originCount(facets, (label) => label.includes('google') || label === 'drive')
    || Number(canonicalDocumentRollup?.google_drive?.unique_hashes || 0);

  return (
    <section className="mb-5 rounded-2xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] p-4 shadow-[var(--lakai-shadow-panel)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--lakai-text-muted)]">
            <span className="font-semibold text-[var(--lakai-text)]">{t('Document sources')}</span>
            <span aria-hidden="true">/</span>
            <span>{t('Files and connected folders used for this case')}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {googleDriveCount > 0 ? (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-100">
                <CheckCircle2 size={16} aria-hidden="true" />
                {t('Google Drive connected')}
                <span className="text-xs font-medium opacity-75">{googleDriveCount}</span>
              </span>
            ) : null}
            {canManageSources ? (
              <Link
                to={`/evidence/cases/${caseId}/intake`}
                aria-label={t('Manage document sources')}
                title={t('Manage document sources')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] text-[var(--lakai-text)] transition hover:border-[var(--lakai-primary)] hover:bg-[var(--lakai-surface)]"
              >
                <Settings2 size={17} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function selectedPipelineDomains(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function exportGuardrailMessage(guardrails, t) {
  const lines = [
    t('Review for sensitive information before sharing or filing. Court rules may require personal information to be removed or limited. Exports should be reviewed by you or your lawyer before use.'),
  ];
  const categories = guardrails?.sensitive_info_warnings || guardrails?.warning_categories || guardrails?.categories || [];
  const documentsWithWarnings = guardrails?.documents_with_warnings ?? guardrails?.sensitive_document_count ?? null;
  if (Number(documentsWithWarnings) > 0) {
    lines.push(t('{count} documents in this export may contain sensitive information.', { count: documentsWithWarnings }));
  }
  if (Array.isArray(categories) && categories.length) {
    const labels = categories
      .map((item) => item?.label || item?.category || item?.value || item)
      .filter(Boolean)
      .slice(0, 6)
      .join(', ');
    if (labels) {
      lines.push(`${t('Sensitive categories to review')}: ${labels}`);
    }
  }
  lines.push(t('Select OK only after you have reviewed who should receive this export.'));
  return lines.join('\n\n');
}

export default function DocumentsPage() {
  const { caseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const attentionContext = String(searchParams.get('attention') || '').trim();
  const isReviewView = false;
  const initialTableState = {
    ...readStoredDocumentsTableState(caseId),
    ...readUrlDocumentsTableState(searchParams),
  };
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { canContribute, canSeeOperations, debugEnabled } = useOperatorMode();
  const documentJobSocketRef = useRef(null);
  const showDiagnostics = canSeeOperations || debugEnabled;
  const canReviewDocuments = canContribute || canSeeOperations;
  const initialFilterValues = {
    processing_status: DEFAULT_PROCESSING_FILTER,
    ...(initialTableState.filterValues || {}),
  };
  const normalizedInitialProcessingStatus = normalizeDocumentStatusFilter(initialFilterValues.processing_status);
  if (normalizedInitialProcessingStatus) {
    initialFilterValues.processing_status = normalizedInitialProcessingStatus;
  } else {
    delete initialFilterValues.processing_status;
  }
  const [queryDraft, setQueryDraft] = useState(initialTableState.appliedQuery || '');
  const [appliedQuery, setAppliedQuery] = useState(initialTableState.appliedQuery || '');
  const [filterValues, setFilterValues] = useState(initialFilterValues);
  const [sort, setSort] = useState(initialTableState.sort || DEFAULT_SORT);
  const [offset, setOffset] = useState(Number(initialTableState.offset || 0));
  const [state, setState] = useState({
    loading: true,
    error: null,
    documents: [],
    total: 0,
    facets: {},
    inventorySummary: {},
    documentsPanelStatus: null,
    documentProcessingReadiness: null,
    documentsLibrarySummary: null,
    documentsPropagationSummary: null,
    canonicalDocumentRollup: null,
    rollupsLoading: true,
    rollupsError: null,
    activePropagationJob: null,
    jobs: null,
    jobsError: null,
    fingerprint: null,
  });
  const [drawer, setDrawer] = useState({
    open: false,
    loading: false,
    error: null,
    document: null,
    fingerprint: null,
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
  const [expandedDocuments, setExpandedDocuments] = useState({});
  const [documentDetails, setDocumentDetails] = useState({});
  const [exportState, setExportState] = useState({
    busy: false,
    error: null,
    fingerprint: null,
  });
  const [processingRequest, setProcessingRequest] = useState({
    busy: false,
    error: null,
    result: null,
  });
  const [expandedStatusTiles, setExpandedStatusTiles] = useState({});
  const [categoryLensId, setCategoryLensId] = useState(DEFAULT_CATEGORY_QA_LENS_ID);
  const [categoryQa, setCategoryQa] = useState({
    loading: true,
    error: null,
    data: null,
    fingerprint: null,
  });
  const [categoryResolve, setCategoryResolve] = useState({
    loading: true,
    error: null,
    data: null,
    result: null,
    busyActionId: null,
    fingerprint: null,
  });

  const jobStatusKnown = Array.isArray(state.jobs);
  const activeDocumentJobForSocket = useMemo(() => {
    if (state.activePropagationJob?.job_id && isActiveJob(state.activePropagationJob)) {
      return state.activePropagationJob;
    }
    if (!Array.isArray(state.jobs)) {
      return null;
    }
    return state.jobs.find((job) => (job.normal_user_visible === true || isDocumentProcessingRequest(job)) && isActiveJob(job)) || null;
  }, [state.activePropagationJob, state.jobs]);
  const hasActiveDocumentProcessingJob = jobStatusKnown
    ? state.jobs.some((job) => (job.normal_user_visible === true || isDocumentProcessingRequest(job)) && isActiveJob(job))
    : true;
  const documentStatusHasActiveJob = !jobStatusKnown || hasActiveDocumentProcessingJob;
  const activeDocumentStatusFilter = normalizeDocumentStatusFilter(filterValues.processing_status);
  const activePropagationSubstageFilter = normalizePropagationSubstageFilter(filterValues.propagation_substage);

  const documentQuery = useMemo(() => ({
    limit: PAGE_SIZE,
    offset,
    q: appliedQuery,
    file_name: filterValues.original_filename,
    origin: filterValues.origin_label,
    evidence_type: filterValues.evidence_type_label,
    storage_status: filterValues.canonical_storage_label,
    factor_code: filterValues.legal_factor_code,
    min_pages: filterValues.page_count,
    require_postgres: selectedPipelineDomains(filterValues.pipeline_status).includes('postgres'),
    require_vector: selectedPipelineDomains(filterValues.pipeline_status).includes('vector'),
    require_graph: selectedPipelineDomains(filterValues.pipeline_status).includes('graph'),
    propagation_bucket: activeDocumentStatusFilter,
    propagation_substage: activePropagationSubstageFilter,
    file_ids: filterValues.file_ids,
    sort_by: sort?.key || 'updated_at',
    sort_dir: sort?.desc ? 'desc' : 'asc',
  }), [activeDocumentStatusFilter, activePropagationSubstageFilter, appliedQuery, filterValues, offset, sort]);
  const exactAffectedDocumentFilterActive = Boolean(String(filterValues.file_ids || '').trim());
  const attentionFilterActive = exactAffectedDocumentFilterActive || Boolean(attentionContext);
  const setDocumentsView = useCallback((view) => {
    const next = new URLSearchParams(searchParams);
    if (view === 'review') {
      next.set('view', 'review');
    } else {
      next.delete('view');
    }
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (isReviewView && !canReviewDocuments) {
      setDocumentsView('library');
    }
  }, [canReviewDocuments, isReviewView, setDocumentsView]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(documentsTableStorageKey(caseId), JSON.stringify({
      appliedQuery,
      filterValues,
      sort,
      offset,
    }));
  }, [appliedQuery, caseId, filterValues, offset, sort]);

  const loadDocuments = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const results = await Promise.allSettled([
        evidenceApi.getDocuments(
          caseId,
          { ...documentQuery, include_rollups: false },
          { token },
        ),
        evidenceApi.getJobs(caseId, { limit: 50, offset: 0 }, { token }),
      ]);
      const result = results[0].status === 'fulfilled' ? results[0].value : null;
      if (!result) {
        throw results[0].reason;
      }
      recordFingerprint(result, 'Documents list');
      if (results[1].status === 'fulfilled') {
        recordFingerprint(results[1].value, 'Jobs list');
      }
      const nextDocuments = result.data?.documents || [];
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        documents: nextDocuments,
        total: result.data?.total || 0,
        facets: result.data?.facets || current.facets || {},
        inventorySummary: result.data?.inventory_summary || current.inventorySummary || {},
        documentsPanelStatus: result.data?.documents_panel_status || null,
        documentProcessingReadiness: result.data?.document_processing_readiness || current.documentProcessingReadiness || null,
        activePropagationJob: result.data?.active_propagation_job || current.activePropagationJob || null,
        jobs: results[1].status === 'fulfilled' ? results[1].value.data?.jobs || [] : null,
        jobsError: results[1].status === 'rejected' ? results[1].reason : null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, documentQuery, getAccessToken, recordFingerprint]);

  const loadDocumentRollups = useCallback(async ({ refresh = false } = {}) => {
    setState((current) => ({ ...current, rollupsLoading: true, rollupsError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocumentRollups(caseId, refresh ? { refresh: true } : {}, { token });
      recordFingerprint(result, 'Document rollups');
      setState((current) => ({
        ...current,
        rollupsLoading: false,
        rollupsError: null,
        documentsLibrarySummary: result.data?.documents_library_summary || current.documentsLibrarySummary || null,
        documentsPropagationSummary: result.data?.documents_propagation_summary || current.documentsPropagationSummary || null,
        canonicalDocumentRollup: result.data?.canonical_document_rollup || current.canonicalDocumentRollup || null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, rollupsLoading: false, rollupsError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const loadCategoryQa = useCallback(async () => {
    setCategoryQa((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCategoryQa(
        caseId,
        {
          lens_id: categoryLensId || DEFAULT_CATEGORY_QA_LENS_ID,
          include_documents: true,
        },
        { token },
      );
      recordFingerprint(result, 'Category review');
      setCategoryQa({
        loading: false,
        error: null,
        data: result.data || null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setCategoryQa((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, categoryLensId, getAccessToken, recordFingerprint]);

  const loadCategoryResolvePlan = useCallback(async () => {
    setCategoryResolve((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCategoryQaResolvePlan(
        caseId,
        {
          lens_id: categoryLensId || DEFAULT_CATEGORY_QA_LENS_ID,
        },
        { token },
      );
      recordFingerprint(result, 'Category review actions');
      setCategoryResolve((current) => ({
        ...current,
        loading: false,
        error: null,
        data: result.data || null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
    } catch (error) {
      setCategoryResolve((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, categoryLensId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDocuments();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDocuments]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDocumentRollups();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDocumentRollups]);

  useEffect(() => {
    const jobId = activeDocumentJobForSocket?.job_id;
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined' || !jobId) {
      return undefined;
    }

    let cancelled = false;
    let socket = null;
    let startTimer = null;

    const refreshAfterJobUpdate = () => {
      void loadDocumentRollups({ refresh: true });
      void loadDocuments();
    };

    const closeSocket = () => {
      window.clearTimeout(startTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'done');
      }
      if (documentJobSocketRef.current === socket) {
        documentJobSocketRef.current = null;
      }
    };

    getAccessToken().then((token) => {
      if (cancelled || !token) {
        return;
      }
      try {
        socket = new WebSocket(evidenceApi.getJobEventsWebSocketUrl(caseId, jobId));
      } catch {
        return;
      }
      if (documentJobSocketRef.current && documentJobSocketRef.current !== socket) {
        try {
          documentJobSocketRef.current.close(1000, 'replaced');
        } catch {
          // Socket cleanup is best-effort.
        }
      }
      documentJobSocketRef.current = socket;
      startTimer = window.setTimeout(() => closeSocket(), DOCUMENT_JOB_SOCKET_START_TIMEOUT_MS);

      socket.addEventListener('open', () => {
        window.clearTimeout(startTimer);
        socket.send(JSON.stringify({ type: 'auth', access_token: token }));
      });

      socket.addEventListener('message', (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        const type = String(payload?.type || '').toLowerCase();
        const jobPayload = payload?.job;
        if (jobPayload?.job_id === jobId) {
          setState((current) => ({ ...current, activePropagationJob: jobPayload }));
        }
        if (type === 'job_complete' || type === 'job_stream_timeout') {
          refreshAfterJobUpdate();
          closeSocket();
        }
      });

      socket.addEventListener('error', () => {
        closeSocket();
      });
    }).catch(() => {});

    return () => {
      cancelled = true;
      closeSocket();
    };
  }, [activeDocumentJobForSocket?.job_id, caseId, getAccessToken, loadDocumentRollups, loadDocuments]);

  useEffect(() => {
    if (!isReviewView || attentionFilterActive) {
      setCategoryQa((current) => ({ ...current, loading: false, error: null, data: null }));
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      loadCategoryQa();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [attentionFilterActive, isReviewView, loadCategoryQa]);

  useEffect(() => {
    if (!isReviewView || attentionFilterActive) {
      setCategoryResolve((current) => ({ ...current, loading: false, error: null, data: null }));
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      loadCategoryResolvePlan();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [attentionFilterActive, isReviewView, loadCategoryResolvePlan]);

  useEffect(() => {
    setExpandedDocuments({});
    setDocumentDetails({});
  }, [documentQuery]);

  useEffect(() => () => {
    if (drawer.previewUrl) {
      URL.revokeObjectURL(drawer.previewUrl);
    }
  }, [drawer.previewUrl]);

  const exportDocumentsWithQuery = useCallback(async (query, filenameToken = 'documents') => {
    setExportState({ busy: true, error: null, fingerprint: null });
    try {
      const token = await getAccessToken();
      let guardrails = null;
      try {
        const guardrailResult = await evidenceApi.getDocumentExportGuardrails(caseId, query, { token });
        recordFingerprint(guardrailResult, 'Document export guardrails');
        guardrails = guardrailResult.data?.export_guardrails || guardrailResult.data || null;
      } catch (guardrailError) {
        guardrails = guardrailError?.payload?.detail?.export_guardrails || null;
      }
      const confirmed = window.confirm(exportGuardrailMessage(guardrails, t));
      if (!confirmed) {
        setExportState({ busy: false, error: null, fingerprint: null });
        return;
      }
      const runExport = () => evidenceApi.exportDocuments(
        caseId,
        { ...query, acknowledge_sensitive_export: true },
        { token },
      );
      let result;
      try {
        result = await runExport();
      } catch (error) {
        const serverGuardrails = error?.payload?.detail?.export_guardrails || error?.payload?.export_guardrails;
        if (error?.status === 409 && serverGuardrails && window.confirm(exportGuardrailMessage(serverGuardrails, t))) {
          result = await runExport();
        } else {
          throw error;
        }
      }
      recordFingerprint(result, 'Documents export');
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `evidence-export-${exportToken(filenameToken)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 500);
      setExportState({
        busy: false,
        error: null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setExportState({ busy: false, error, fingerprint: null });
    }
  }, [caseId, getAccessToken, recordFingerprint, t]);

  const exportCurrentView = useCallback(async () => {
    const activeFactor = String(filterValues.legal_factor_code || filterValues.evidence_type_label || '').toUpperCase() || 'documents';
    await exportDocumentsWithQuery(documentQuery, activeFactor);
  }, [documentQuery, exportDocumentsWithQuery, filterValues.evidence_type_label, filterValues.legal_factor_code]);

  const exportCategoryReview = useCallback(async (category) => {
    const query = categoryReviewExportQuery(category, sort);
    const name = category?.code || category?.label || category?.category_id || 'category-review';
    await exportDocumentsWithQuery(query, `category-review-${name}`);
  }, [exportDocumentsWithQuery, sort]);

  const resolveCategoryReviewAction = useCallback(async (action, extraPayload = {}) => {
    const actionId = action?.action_id || action?.id || action?.status || 'category_review_action';
    setCategoryResolve((current) => ({
      ...current,
      busyActionId: actionId,
      error: null,
      result: null,
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.resolveCategoryQaAction(
        caseId,
        {
          action_id: actionId,
          lens_id: categoryLensId || DEFAULT_CATEGORY_QA_LENS_ID,
          category: action?.category || action?.category_id || action?.code || null,
          ...extraPayload,
        },
        { token },
      );
      recordFingerprint(result, 'Category review action');
      setCategoryResolve((current) => ({
        ...current,
        busyActionId: null,
        error: null,
        result: result.data || {},
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await Promise.all([loadCategoryQa(), loadCategoryResolvePlan(), loadDocuments()]);
    } catch (error) {
      setCategoryResolve((current) => ({
        ...current,
        busyActionId: null,
        error,
        result: null,
      }));
    }
  }, [caseId, categoryLensId, getAccessToken, loadCategoryQa, loadCategoryResolvePlan, loadDocuments, recordFingerprint]);

  const requestPendingDocumentProcessing = useCallback(async ({ quiet = false } = {}) => {
    if (!canContribute) {
      return null;
    }
    setProcessingRequest((current) => ({ ...current, busy: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.requestDocumentProcessing(
        caseId,
        {
          scope: 'copied_not_extracted',
          requested_action: 'text_extraction_and_search_indexing',
          reason: 'Automatically start processing after documents were added to the workspace',
          max_documents: 250,
        },
        { token },
      );
      recordFingerprint(result, 'Document text/search processing');
      setProcessingRequest({ busy: false, error: null, result: result.data || {} });
      if (!quiet) {
        await loadDocuments();
      }
      return result.data || {};
    } catch (error) {
      const detail = error?.data || error?.detail;
      const noProcessingNeeded = error?.status === 409 && (
        String(detail?.error || '').toLowerCase().includes('no copied documents') ||
        String(detail?.user_status || '').toLowerCase().includes('no self-service processing')
      );
      if (noProcessingNeeded) {
        setProcessingRequest({
          busy: false,
          error: null,
          result: {
            display_message: detail?.user_status || 'No self-service processing is needed right now.',
            can_start_processing: false,
            already_started: false,
          },
        });
        return null;
      }
      setProcessingRequest({ busy: false, error, result: null });
      return null;
    }
  }, [canContribute, caseId, getAccessToken, loadDocuments, recordFingerprint]);

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

  const resetTable = () => {
    setQueryDraft('');
    setAppliedQuery('');
    setFilterValues({});
    setSort(DEFAULT_SORT);
    setOffset(0);
  };

  const setDocumentStatusFilter = (status) => {
    setOffset(0);
    setFilterValues((current) => {
      const next = { ...current };
      const normalizedStatus = normalizeDocumentStatusFilter(status);
      if (normalizedStatus) {
        next.processing_status = normalizedStatus;
      } else {
        delete next.processing_status;
      }
      delete next.propagation_substage;
      return next;
    });
  };

  const setDocumentSourceFilter = (origin) => {
    setOffset(0);
    setFilterValues((current) => {
      const next = { ...current };
      delete next.processing_status;
      delete next.propagation_substage;
      if (origin) {
        next.origin_label = origin;
      } else {
        delete next.origin_label;
      }
      return next;
    });
  };

  const setPropagationBreakdownFilter = (bucket, substage) => {
    setOffset(0);
    setFilterValues((current) => {
      const next = { ...current };
      const normalizedBucket = normalizeDocumentStatusFilter(bucket);
      const normalizedSubstage = normalizePropagationSubstageFilter(substage);
      if (normalizedBucket) {
        next.processing_status = normalizedBucket;
      } else {
        delete next.processing_status;
      }
      if (normalizedSubstage) {
        next.propagation_substage = normalizedSubstage;
      } else {
        delete next.propagation_substage;
      }
      return next;
    });
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
      previewLoading: Boolean(document.s3_key),
      previewError: null,
      previewUrl: null,
      previewContentType: null,
      removalBusy: false,
      removalError: null,
      removalJob: null,
      removalMessage: null,
      removalDialogOpen: false,
    });
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocument(caseId, document.file_id, { token });
      recordFingerprint(result, 'Document drawer detail');
      const detailDocument = result.data || document;
      setDrawer({
        open: true,
        loading: false,
        error: null,
        document: detailDocument,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
        previewLoading: Boolean(detailDocument.s3_key),
        previewError: null,
        previewUrl: null,
        previewContentType: null,
        removalBusy: false,
        removalError: null,
        removalJob: null,
        removalMessage: null,
        removalDialogOpen: false,
      });
      if (detailDocument.s3_key) {
        try {
          const previewResult = await evidenceApi.previewDocument(caseId, detailDocument.file_id, { token });
          recordFingerprint(previewResult, 'Document raw preview');
          const previewUrl = URL.createObjectURL(previewResult.blob);
          setDrawer((current) => {
            if (current.document?.file_id !== detailDocument.file_id) {
              URL.revokeObjectURL(previewUrl);
              return current;
            }
            return {
              ...current,
              previewLoading: false,
              previewError: null,
              previewUrl,
              previewContentType: previewResult.contentType,
            };
          });
        } catch (previewError) {
          setDrawer((current) => (
            current.document?.file_id === detailDocument.file_id
              ? { ...current, previewLoading: false, previewError }
              : current
          ));
        }
      }
    } catch (error) {
      setDrawer((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const closeDocumentDrawer = () => {
    setDrawer((current) => {
      if (current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return { ...current, open: false, previewUrl: null, previewLoading: false };
    });
  };

  const openRemovalDialog = useCallback(() => {
    if (!drawer.document?.file_id || drawer.removalBusy) {
      return;
    }
    setDrawer((current) => ({
      ...current,
      removalDialogOpen: true,
      removalError: null,
      removalJob: null,
      removalMessage: null,
    }));
  }, [drawer.document?.file_id, drawer.removalBusy]);

  const closeRemovalDialog = useCallback(() => {
    if (drawer.removalBusy) {
      return;
    }
    setDrawer((current) => ({ ...current, removalDialogOpen: false }));
  }, [drawer.removalBusy]);

  const excludeDocumentFromProcessing = useCallback(async (removalPayload) => {
    const document = drawer.document;
    if (!document?.file_id || drawer.removalBusy) {
      return;
    }
    if (!removalPayload) {
      return;
    }
    setDrawer((current) => ({
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
      setDrawer((current) => ({
        ...current,
        removalBusy: false,
        removalError: null,
        removalJob: result.data,
        removalMessage: removalResultDetail(result.data, removalPayload, t, document.original_filename || document.file_id),
        removalDialogOpen: false,
      }));
      await loadDocuments();
    } catch (error) {
      setDrawer((current) => ({ ...current, removalBusy: false, removalError: error }));
    }
  }, [caseId, drawer.document, drawer.removalBusy, getAccessToken, loadDocuments, recordFingerprint, t]);

  const loadDocumentDetail = useCallback(async (document) => {
    if (!document?.file_id) {
      return null;
    }
    if (documentDetails[document.file_id]?.document) {
      return documentDetails[document.file_id].document;
    }
    setDocumentDetails((current) => ({
      ...current,
      [document.file_id]: { loading: true, error: null, document: current[document.file_id]?.document || document },
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocument(caseId, document.file_id, { token });
      recordFingerprint(result, 'Document expanded detail');
      setDocumentDetails((current) => ({
        ...current,
        [document.file_id]: { loading: false, error: null, document: result.data || document },
      }));
      return result.data || document;
    } catch (error) {
      setDocumentDetails((current) => ({
        ...current,
        [document.file_id]: { loading: false, error, document },
      }));
      return null;
    }
  }, [caseId, documentDetails, getAccessToken, recordFingerprint]);

  const toggleExpandedDocument = useCallback((document) => {
    if (!document?.file_id) {
      return;
    }
    setExpandedDocuments((current) => ({ ...current, [document.file_id]: !current[document.file_id] }));
    if (!documentDetails[document.file_id]?.document) {
      loadDocumentDetail(document);
    }
  }, [documentDetails, loadDocumentDetail]);

  const displayDocumentStatus = useCallback((document) => (
    documentUserStatusForJobState(document, { hasActiveProcessingJob: documentStatusHasActiveJob })
  ), [documentStatusHasActiveJob]);

  const documentColumns = useMemo(() => ([
    {
      key: 'original_filename',
      header: t('File'),
      headerClassName: 'w-[38%]',
      className: 'min-w-0',
      help: t('The file name recorded for this evidence item. Click the name for the document detail page; click the row for the drawer.'),
      filterPlaceholder: t('Filename or hash'),
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
      headerClassName: 'w-[16%]',
      help: t('Where the item originally came from, such as Google Drive, web upload, or a communication export.'),
      filterOptions: facetOptions(state.facets, 'origin_label'),
      filterPlaceholder: t('Google Drive, upload, SMS'),
      render: (document) => document.origin_label || 'unknown',
    },
    { key: 'updated_at', header: t('Updated'), headerClassName: 'w-[18%]', filterable: false, render: (document) => formatDateTime(document.updated_at || document.created_at) },
    {
      key: 'processing_status',
      header: t('Status'),
      headerClassName: 'w-[18%]',
      sortable: false,
      filterOptions: [
        { value: 'ready', label: t('Ready') },
        { value: 'processing', label: t('Processing') },
        { value: 'partial', label: t('Partial') },
        { value: 'failed', label: t('Failed') },
      ],
      filterPlaceholder: t('Ready, processing, partial, failed'),
      help: t('A simple rollup of whether this document is ready, actively processing, partially propagated, or failed.'),
      render: (document) => <DocumentRowStatus document={documentDetails[document.file_id]?.document || document} hasActiveProcessingJob={documentStatusHasActiveJob} t={t} />,
    },
  ]), [caseId, documentDetails, documentStatusHasActiveJob, state.facets, t]);

  const appliedFilters = useMemo(() =>
    Object.entries(filterValues || {})
      .filter(([, value]) => String(value || '').trim())
      .map(([key, value]) => {
        const column = documentColumns.find((candidate) => candidate.key === key);
        if (key === 'file_ids') {
          const count = String(value || '').split(',').filter(Boolean).length;
          return { id: key, label: t('Affected documents: {count}', { count }) };
        }
        if (key === 'pipeline_status') {
          const labels = selectedPipelineDomains(value)
            .map((domain) => (column?.filterOptions || []).find((option) => option.value === domain)?.label || domain)
            .join(` ${t('AND')} `);
          return { id: key, label: `${column?.header || key}: ${labels}` };
        }
        if (key === 'processing_status') {
          const labels = {
            ready: 'Ready',
            processing: 'Processing',
            partial: 'Partial',
            failed: 'Failed',
          };
          const normalizedValue = normalizeDocumentStatusFilter(value);
          return { id: key, label: `${t('Status')}: ${t(labels[normalizedValue] || value)}` };
        }
        if (key === 'propagation_substage') {
          return {
            id: key,
            label: `${t('Stage')}: ${t(String(value || '').replace(/_/g, ' '))}`,
          };
        }
        const optionLabel = (column?.filterOptions || []).find((option) => option.value === value)?.label || value;
        return { id: key, label: `${column?.header || key}: ${optionLabel}` };
      }), [documentColumns, filterValues, t]);

  const clearColumnFilter = (columnId) => {
    setOffset(0);
    setFilterValues((current) => {
      const next = { ...current };
      delete next[columnId];
      if (columnId === 'processing_status') {
        delete next.propagation_substage;
      }
      return next;
    });
  };

  const inventorySummary = useMemo(() => state.inventorySummary || {}, [state.inventorySummary]);
  const librarySummary = state.documentsLibrarySummary || {};
  const rollupsReady = Array.isArray(librarySummary.tiles) && librarySummary.tiles.length > 0;
  const libraryTileById = useMemo(() => {
    const libraryTiles = Array.isArray(librarySummary.tiles) ? librarySummary.tiles : [];
    const entries = libraryTiles
      .map((tile) => [String(tile.id || tile.key || tile.label || '').toLowerCase().replace(/\s+/g, '_'), tile])
      .filter(([key]) => key);
    return Object.fromEntries(entries);
  }, [librarySummary.tiles]);
  const sourceComposition = useMemo(
    () => documentSourceComposition(state.facets, state.canonicalDocumentRollup),
    [state.canonicalDocumentRollup, state.facets],
  );
  const extractedFiles = inventorySummary.extracted_files || 0;
  const s3OnlyFiles = inventorySummary.s3_files_not_extracted || 0;
  const rawReadyCount = Number(libraryTileById.ready?.count ?? extractedFiles ?? 0);
  const rawProcessingCount = Number(libraryTileById.processing?.count ?? s3OnlyFiles ?? 0);
  const rawPartialCount = Number(libraryTileById.partial?.count ?? librarySummary.counts?.partial ?? 0);
  const rawFailedCount = Number(libraryTileById.failed?.count ?? inventorySummary.failed_documents ?? inventorySummary.failed_document_rows ?? 0);
  const idlePropagationCount = 0;
  const effectiveProcessingCount = rawProcessingCount;
  const effectiveFailedCount = rawFailedCount;
  const effectiveTileCountByStatus = {
    ready: rawReadyCount,
    processing: effectiveProcessingCount,
    partial: rawPartialCount,
    failed: effectiveFailedCount,
  };
  const visibleDocuments = activeDocumentStatusFilter
    ? state.documents.filter((document) => {
      const rowDocument = documentDetails[document.file_id]?.document || document;
      const statusMatches = normalizeDocumentStatusFilter(displayDocumentStatus(rowDocument).key) === activeDocumentStatusFilter;
      const substageMatches = !activePropagationSubstageFilter
        || normalizePropagationSubstageFilter(rowDocument?.propagation_status?.propagation_substage) === activePropagationSubstageFilter;
      return statusMatches && substageMatches;
    })
    : state.documents;
  const activeBreakdownCount = activeDocumentStatusFilter && activePropagationSubstageFilter
    ? Number((librarySummary.breakdown?.[activeDocumentStatusFilter] || []).find((item) => item.key === activePropagationSubstageFilter)?.count ?? visibleDocuments.length)
    : null;
  const displayedTotal = activeDocumentStatusFilter
    ? Number(activeBreakdownCount ?? effectiveTileCountByStatus[activeDocumentStatusFilter] ?? visibleDocuments.length)
    : state.total;
  const firstVisibleRow = displayedTotal && visibleDocuments.length ? offset + 1 : 0;
  const lastVisibleRow = Math.min(displayedTotal || 0, offset + visibleDocuments.length);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((displayedTotal || 0) / PAGE_SIZE));
  const canGoPrevious = offset > 0;
  const canGoNext = offset + PAGE_SIZE < displayedTotal;
  const processingRequestData = processingRequest.result || {};
  const processingRequestJobId = processingRequestData.job?.job_id || processingRequestData.existing_job?.job_id || processingRequestData.job_id || null;
  const processingBatchDocumentCount = Number(
    processingRequestData.requested_document_count
    || processingRequestData.job?.requested_document_count
    || processingRequestData.existing_job?.requested_document_count
    || 0,
  );
  const processingRequestCount = idlePropagationCount || rawProcessingCount || s3OnlyFiles;
  const processingBatchDiffers = Boolean(
    processingBatchDocumentCount
    && processingRequestCount
    && processingBatchDocumentCount !== processingRequestCount,
  );
  const processingStartTitle = processingRequestData.already_started ? 'Processing already started' : 'Processing started';
  const processingStartMessage = processingRequestData.display_message || (processingRequestData.already_started
    ? 'Processing already started. Check Jobs for per-document progress.'
    : 'Processing started. Check Jobs for per-document progress.');
  const autoProcessingReady = canContribute && s3OnlyFiles > 0 && effectiveProcessingCount > 0 && !processingRequest.busy && !processingRequest.result && !processingRequest.error;
  const attentionItems = useMemo(() => filterAttentionItems(buildCaseAttentionItems({
    caseId,
    counts: inventorySummary,
    documentsPanelStatus: state.documentsPanelStatus,
    documentProcessingReadiness: state.documentProcessingReadiness,
  }), 'documents'), [caseId, inventorySummary, state.documentProcessingReadiness, state.documentsPanelStatus]);

  useEffect(() => {
    if (!processingRequest.busy) {
      return undefined;
    }
    const timerId = window.setInterval(() => {
      void loadDocuments();
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [loadDocuments, processingRequest.busy]);

  useEffect(() => {
    if (!autoProcessingReady) {
      return;
    }
    void requestPendingDocumentProcessing({ quiet: true });
  }, [autoProcessingReady, requestPendingDocumentProcessing]);

  const applyColumnFilter = (columnId, value) => {
    setOffset(0);
    setFilterValues((current) => {
      const next = { ...current };
      if (value) {
        next[columnId] = value;
      } else {
        delete next[columnId];
      }
      return next;
    });
  };

  const filterCategoryReviewDocuments = (category) => {
    if (!category) {
      return;
    }
    const filters = categoryReviewFilterValues(category);
    setDocumentsView('library');
    setOffset(0);
    setFilterValues((current) => {
      const next = { ...current };
      delete next.evidence_type_label;
      delete next.legal_factor_code;
      if (filters.evidence_type_label) {
        next.evidence_type_label = filters.evidence_type_label;
      }
      if (filters.legal_factor_code) {
        next.legal_factor_code = filters.legal_factor_code;
      }
      return next;
    });
  };

  const filterUncategorizedDocuments = () => {
    applyColumnFilter('evidence_type_label', 'Uncategorized');
  };
  const drawerStatus = displayDocumentStatus(drawer.document || {});

  return (
    <div>
      <PageHeader
        title="Documents"
        description={`${state.total} ${t('documents in this workspace')}${appliedQuery ? ` ${t('matching')} "${appliedQuery}"` : ''}. ${t('Use this library to find, preview, remove, export, and organize files.')}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canContribute ? (
              <Link
                to={`/evidence/cases/${caseId}/intake`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)]"
              >
                <Plus size={16} aria-hidden="true" />
                {t('Add documents')}
              </Link>
            ) : null}
            {!isReviewView ? (
              <button
                type="button"
                onClick={exportCurrentView}
                disabled={exportState.busy || state.loading || !state.total}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-4 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={16} aria-hidden="true" />
                {exportState.busy ? t('Exporting') : t('Export document list')}
              </button>
            ) : null}
          </div>
        }
      />

      <DocumentSourcesStrip
        caseId={caseId}
        facets={state.facets}
        canonicalDocumentRollup={state.canonicalDocumentRollup}
        t={t}
        canManageSources={canContribute}
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDocuments} /></div> : null}
      {exportState.error ? <div className="mb-5"><ErrorPanel title="Document export failed" error={exportState.error} /></div> : null}

      {isReviewView ? (
        <>
          {attentionFilterActive ? (
            <section className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
              <h3 className="font-semibold">{t('Reviewing affected documents')}</h3>
              <p className="mt-1">
                {t('This view is limited to documents linked from a health item. Open the Library tab to review the affected files first.')}
              </p>
              <button
                type="button"
                onClick={() => setDocumentsView('library')}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-[#101820] dark:text-sky-100 dark:hover:bg-sky-950/40"
              >
                {t('Open Library')}
              </button>
            </section>
          ) : (
            <CategoryReviewPanel
              caseId={caseId}
              data={categoryQa.data}
              error={categoryQa.error}
              exportBusy={exportState.busy}
              lensId={categoryLensId}
              loading={categoryQa.loading}
              onLoadResolvePlan={loadCategoryResolvePlan}
              onExportCurrentView={exportCategoryReview}
              onFilterCategory={filterCategoryReviewDocuments}
              onFilterUncategorized={filterUncategorizedDocuments}
              onLensChange={(value) => setCategoryLensId(value || DEFAULT_CATEGORY_QA_LENS_ID)}
              onRetry={loadCategoryQa}
              onResolveAction={resolveCategoryReviewAction}
              resolveActionBusyId={categoryResolve.busyActionId}
              resolveError={categoryResolve.error}
              resolveLoading={categoryResolve.loading}
              resolvePlan={categoryResolve.data}
              resolveResult={categoryResolve.result}
            />
          )}

          {showDiagnostics && categoryQa.fingerprint?.id ? (
            <div className="mb-5">
              <RequestFingerprint fingerprintId={categoryQa.fingerprint.id} correlationId={categoryQa.fingerprint.correlationId} label={t('Category review fingerprint')} />
            </div>
          ) : null}
        </>
      ) : (
        <>
      {attentionItems.length ? (
        <NeedsAttentionPanel
          items={attentionItems}
          title="Document attention"
          description="Document issues that affect processing, source copies, search, export, or source checks."
        />
      ) : null}

      {rawProcessingCount > 0 ? (
        <section className={`mb-5 rounded-lg border p-4 text-sm ${
          idlePropagationCount > 0
            ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100'
            : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100'
        }`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <div>
                <h2 className="font-semibold">{idlePropagationCount > 0 ? t('Document processing needs restart') : t('Documents are processing')}</h2>
                <p className="mt-1">
                  {idlePropagationCount > 0
                    ? t('{count} document row(s) are not fully propagated and no processing job is active.', { count: idlePropagationCount })
                    : t('{count} document row(s) are still moving through processing before they are fully available in Documents and Ask Documents.', { count: effectiveProcessingCount })}
                </p>
                <p className={`mt-1 text-xs ${idlePropagationCount > 0 ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>
                  {idlePropagationCount > 0
                    ? t('These files are shown as Failed because full propagation is not complete and there is no active job moving them forward.')
                    : t('This is not a legal review task. It means the source file is saved, but processing and propagation have not finished yet.')}
                </p>
                <p className={`mt-1 text-xs ${idlePropagationCount > 0 ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>
                  {idlePropagationCount > 0
                    ? t('What it affects: Ask Documents may miss these files until processing is restarted and full propagation finishes.')
                    : t('Why this happened: these files were copied or imported after the last full processing run, so extraction, search indexing, or relationship/source propagation is still catching up.')}
                </p>
                <p className={`mt-1 text-xs ${idlePropagationCount > 0 ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>
                  {idlePropagationCount > 0
                    ? t('Next step: restart processing or open Jobs to retry the failed batch if a retry is available.')
                    : canContribute
                      ? t('Processing starts automatically when files are added. You can keep working while extraction, search indexing, and source checks run in the background.')
                      : t('Processing starts automatically when files are added by someone with upload access. You can keep reviewing uploaded files while processing finishes.')}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {(idlePropagationCount > 0 || processingRequest.error) && canContribute ? (
                <button
                  type="button"
                  onClick={() => requestPendingDocumentProcessing()}
                  disabled={processingRequest.busy}
                  className={`inline-flex items-center justify-center rounded-md border bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#101820] ${
                    idlePropagationCount > 0
                      ? 'border-red-300 text-red-950 hover:bg-red-100 dark:border-red-900/70 dark:text-red-100 dark:hover:bg-red-950/40'
                      : 'border-amber-300 text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:text-amber-100 dark:hover:bg-amber-950/40'
                  }`}
                >
                  {processingRequest.busy ? t('Restarting processing') : t('Restart processing')}
                </button>
              ) : (
                <Link
                  to={processingRequestJobId ? `/evidence/cases/${caseId}/jobs/${processingRequestJobId}` : `/evidence/cases/${caseId}/jobs#processing-status`}
                  className={`inline-flex items-center justify-center rounded-md border bg-white px-3 py-2 text-sm font-semibold dark:bg-[#101820] ${
                    idlePropagationCount > 0
                      ? 'border-red-300 text-red-950 hover:bg-red-100 dark:border-red-900/70 dark:text-red-100 dark:hover:bg-red-950/40'
                      : 'border-amber-300 text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:text-amber-100 dark:hover:bg-amber-950/40'
                  }`}
                >
                  {processingRequest.busy ? t('Starting automatically') : t('See processing status')}
                </Link>
              )}
            </div>
          </div>
          {processingRequest.error ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
              <p className="font-semibold">{t('Processing did not start')}</p>
              <p className="mt-1 text-xs">{processingRequest.error.message || t('Evidence API returned an error.')}</p>
            </div>
          ) : null}
          {processingRequest.result ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-100">
              <p className="font-semibold">{t(processingStartTitle)}</p>
              <p className="mt-1 text-xs">
                {t(processingStartMessage)}
              </p>
              <p className="mt-1 text-xs">
                {t('Current document list shows {count} document row(s) still need text/search processing before they are fully available in Ask Documents.', { count: processingRequestCount })}
              </p>
              {processingBatchDiffers ? (
                <p className="mt-1 text-xs">
                  {t('The existing processing batch includes {count} file(s) from when it started. That can differ from the current document count after duplicates, completed files, or excluded files are accounted for.', { count: processingBatchDocumentCount })}
                </p>
              ) : null}
              {processingRequestJobId ? (
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${processingRequestJobId}`}
                  className="mt-2 inline-flex text-xs font-semibold text-emerald-900 hover:text-emerald-950 dark:text-emerald-100 dark:hover:text-white"
                >
                  {t('Open processing details')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-normal text-[var(--lakai-text-muted)]">{t('Propagation status')}</h2>
          <p className="text-sm text-[var(--lakai-text-muted)]">
            {t('Canonical document counts are based on unique file hashes, so duplicate source rows are counted once.')}
            {state.rollupsLoading && !rollupsReady ? ` ${t('Status totals are loading separately so the document table can appear faster.')}` : ''}
          </p>
          {state.rollupsError ? (
            <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
              {t('Status totals could not load yet. The document table is still available.')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label={t('Document status filters')}>
        {[
          {
            id: 'all',
            label: libraryTileById.all?.label || libraryTileById.all_documents?.label || 'Document total',
            value: libraryTileById.all?.count ?? libraryTileById.all_documents?.count ?? inventorySummary.total_documents ?? inventorySummary.document_rows ?? state.total,
            detail: libraryTileById.all?.helper || libraryTileById.all_documents?.helper || libraryTileById.all_documents?.description || 'Canonical documents counted once by unique file hash',
            filter: '',
          },
          {
            id: 'ready',
            label: libraryTileById.ready?.label || 'Ready',
            value: rollupsReady ? rawReadyCount : '...',
            detail: libraryTileById.ready?.helper || libraryTileById.ready?.description || 'Documents ready for review and Ask Documents',
            filter: 'ready',
          },
          {
            id: 'processing',
            label: libraryTileById.processing?.label || 'Processing',
            value: rollupsReady ? effectiveProcessingCount : '...',
            detail: libraryTileById.processing?.helper || libraryTileById.processing?.description || 'Documents still being prepared',
            filter: 'processing',
          },
          {
            id: 'partial',
            label: libraryTileById.partial?.label || 'Partial',
            value: rollupsReady ? rawPartialCount : '...',
            detail: libraryTileById.partial?.helper || libraryTileById.partial?.description || 'Some propagation exists, but a required stage is missing',
            filter: 'partial',
          },
          {
            id: 'failed',
            label: libraryTileById.failed?.label || 'Failed',
            value: rollupsReady ? effectiveFailedCount : '...',
            detail: libraryTileById.failed?.helper || libraryTileById.failed?.description || 'No usable propagation is complete',
            filter: 'failed',
          },
        ].map((tile) => {
          const selected = normalizeDocumentStatusFilter(filterValues.processing_status) === tile.filter && !activePropagationSubstageFilter;
          const expandable = tile.id === 'all' || tile.id === 'partial';
          const expanded = expandable && Boolean(expandedStatusTiles[tile.id]);
          const subcategoryItems = tile.id === 'all'
            ? sourceComposition
            : (Array.isArray(librarySummary.breakdown?.[tile.id]) ? librarySummary.breakdown[tile.id] : []);
          const hasSubcategories = subcategoryItems.length > 0;
          return (
            <section
              key={tile.id}
              className={`overflow-hidden rounded-2xl border shadow-[var(--lakai-shadow-panel)] transition ${
                selected
                  ? 'border-[var(--lakai-primary)] bg-[var(--lakai-primary)] text-[var(--lakai-primary-text)]'
                  : 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] text-[var(--lakai-text)] hover:border-[var(--lakai-primary)] hover:bg-[var(--lakai-surface-muted)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setDocumentStatusFilter(tile.filter)}
                className="block w-full p-4 text-left"
                aria-pressed={selected}
              >
                <div className={`text-xs font-semibold uppercase tracking-normal ${selected ? 'text-[var(--lakai-primary-text)]/80' : 'text-[var(--lakai-text-muted)]'}`}>{t(tile.label)}</div>
                <div className="mt-1 text-2xl font-semibold">{tile.value}</div>
                <div className={`mt-1 text-sm ${selected ? 'text-[var(--lakai-primary-text)]/85' : 'text-[var(--lakai-text-muted)]'}`}>{t(tile.detail)}</div>
              </button>
              {expandable ? (
                <button
                  type="button"
                  onClick={() => setExpandedStatusTiles((current) => ({ ...current, [tile.id]: !current[tile.id] }))}
                  className={`flex min-h-10 w-full items-center justify-center border-t px-3 py-2 text-xs font-semibold transition ${
                    selected
                      ? 'border-white/20 text-[var(--lakai-primary-text)]/85 hover:bg-white/10'
                      : 'border-[var(--lakai-border-soft)] text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface)] hover:text-[var(--lakai-text)]'
                  }`}
                  aria-expanded={expanded}
                  aria-label={expanded ? t('Collapse {label} breakdown', { label: t(tile.label) }) : t('Expand {label} breakdown', { label: t(tile.label) })}
                >
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              ) : null}
              {expanded ? (
                <div className={`border-t p-3 ${selected ? 'border-white/20 bg-black/5' : 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)]'}`}>
                  {hasSubcategories ? (
                    <div className="grid gap-2">
                      {subcategoryItems.map((item) => {
                        const itemBucket = tile.id;
                        const itemSubstage = tile.id === 'partial' ? normalizePropagationSubstageFilter(item.key) : '';
                        const itemSelected = tile.id === 'all'
                          ? String(filterValues.origin_label || '') === String(item.filterValue || item.label || '')
                          : normalizeDocumentStatusFilter(filterValues.processing_status) === itemBucket
                            && (!itemSubstage || activePropagationSubstageFilter === itemSubstage);
                        const handleSubcategoryClick = () => {
                          if (tile.id === 'all') {
                            setDocumentSourceFilter(item.filterValue || item.label);
                          } else {
                            setPropagationBreakdownFilter(tile.id, item.key);
                          }
                        };
                        return (
                          <button
                            key={`${tile.id}-${item.key}`}
                            type="button"
                            onClick={handleSubcategoryClick}
                            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                              itemSelected
                                ? 'border-[var(--lakai-primary)] bg-[var(--lakai-primary)] text-[var(--lakai-primary-text)]'
                                : 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] text-[var(--lakai-text)] hover:border-[var(--lakai-primary)]'
                            }`}
                            aria-pressed={itemSelected}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold">{t(item.label)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                itemSelected
                                  ? 'bg-white/20 text-[var(--lakai-primary-text)]'
                                  : 'bg-[var(--lakai-surface-muted)] text-[var(--lakai-text)]'
                              }`}>
                                {tile.id === 'all' || rollupsReady ? item.count : '...'}
                              </span>
                            </div>
                            {(item.next_action?.user_message || item.userMessage) ? (
                              <p className={`mt-1 text-xs ${itemSelected ? 'text-[var(--lakai-primary-text)]/80' : 'text-[var(--lakai-text-muted)]'}`}>
                                {t(item.next_action?.user_message || item.userMessage)}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={`text-sm ${selected ? 'text-[var(--lakai-primary-text)]/80' : 'text-[var(--lakai-text-muted)]'}`}>
                      {rollupsReady
                        ? t(tile.id === 'all' ? 'No document sources reported yet.' : 'No subcategories reported for this status.')
                        : t(tile.id === 'all' ? 'Document sources are loading.' : 'Status subcategories are loading.')}
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

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
        {showDiagnostics && state.fingerprint?.id ? (
          <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} />
        ) : null}
        {showDiagnostics && exportState.fingerprint?.id ? (
          <RequestFingerprint fingerprintId={exportState.fingerprint.id} correlationId={exportState.fingerprint.correlationId} label={t('Export fingerprint')} />
        ) : null}
      </div>

      <DataTable
        rows={visibleDocuments}
        rowKey={(document) => document.file_id}
        loading={state.loading}
        emptyTitle={state.loading ? t('Loading documents') : t('No documents matched')}
        enableHeaderMenus
        filterValues={filterValues}
        sort={sort}
        onFilterChange={(columnId, value) => {
          setOffset(0);
          setFilterValues((current) => {
            const next = { ...current, [columnId]: value };
            if (columnId === 'processing_status') {
              delete next.propagation_substage;
            }
            return next;
          });
        }}
        onClearFilter={clearColumnFilter}
        onClearAllFilters={resetTable}
        onSort={(columnId, desc) => {
          setOffset(0);
          setSort({ key: columnId, desc });
        }}
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
        mobileSubtitle={(document) => `${document.origin_label || 'unknown'} | ${documentKindLabel(document)} | ${document.query_readiness?.label || document.canonical_storage_label || 'pending'}`}
        mobileActions={(document) => (
          <Link to={`/evidence/cases/${caseId}/documents/${document.file_id}`} className="text-gray-400 hover:text-sky-700 dark:hover:text-sky-300" title={t('Open document detail page')}>
            <ExternalLink size={15} aria-hidden="true" />
          </Link>
        )}
        expandedRows={expandedDocuments}
        onToggleRow={toggleExpandedDocument}
        renderDetailPanel={(document) => {
          const detailState = documentDetails[document.file_id];
          const detail = detailState?.document;
          const pages = detail?.pages || [];
          if (detailState?.error) {
            return <ErrorPanel title={t('Document page text load failed')} error={detailState.error} />;
          }
          if (detailState?.loading) {
            return <div className="text-sm text-gray-600 dark:text-gray-400">{t('Loading pages / extracted text...')}</div>;
          }
          const rowDocument = detail || document;
          const rowIsMedia = isAudioDocument(rowDocument) || isVideoDocument(rowDocument);
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{documentTextSectionLabel(rowDocument, t)}</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {pages.length
                      ? rowIsMedia
                        ? t('{size} transcript record(s)', { size: pages.length })
                        : t('{size} page(s) with extracted text', { size: pages.length })
                      : rowIsMedia
                        ? t('No transcript text is available yet.')
                        : t('No page text is available yet.')}
                  </div>
                </div>
                <PipelineDots document={detail || document} t={t} />
              </div>
              {rowIsMedia && hasTranscript(rowDocument) ? (
                <TranscriptPanel document={rowDocument} compact />
              ) : null}
              {pages.length ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {pages.slice(0, 12).map((page) => (
                    <div key={`${page.page_number}-${page.text_source}`} className="rounded-md border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-[#101820]">
                      <div className="font-semibold text-gray-950 dark:text-white">{rowIsMedia ? t('Transcript record') : t('Page')} {page.page_number}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{page.text_source || t('unknown source')} | {page.page_text_chars ?? 0} {t('characters')}</div>
                      <p className="mt-2 line-clamp-3 text-gray-700 dark:text-gray-300">{page.page_text_preview || t('No preview text.')}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }}
        columns={documentColumns}
      />

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {t('Showing {first}-{last} of {total}; page {page} of {pages}', {
            first: firstVisibleRow,
            last: lastVisibleRow,
            total: displayedTotal,
            page: currentPage,
            pages: totalPages,
          })}
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
        </>
      )}

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
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{drawer.document?.original_filepath || t('Loading document')}</div>
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
              {showDiagnostics && drawer.fingerprint?.id ? (
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
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                      {(isAudioDocument(drawer.document) || isVideoDocument(drawer.document)) ? t('Transcript records') : t('Pages')}
                    </div>
                    <div className="text-gray-950 dark:text-white">
                      {(isAudioDocument(drawer.document) || isVideoDocument(drawer.document))
                        ? transcriptPages(drawer.document).length
                        : drawer.document?.page_count ?? '0'}
                    </div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Origin')}</div>
                    <div className="break-words text-gray-950 dark:text-white">{drawer.document?.origin_label || 'unknown'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Category')}</div>
                    <div className="break-words text-gray-950 dark:text-white">{documentKindLabel(drawer.document, drawer.previewContentType)}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Document status')}</div>
                    <div className="mt-2 break-words">
                      <div className="flex items-center gap-2" title={t(drawerStatus.description)}>
                        <span className={`h-9 w-1.5 rounded-full ${drawerStatus.barClassName}`} aria-hidden="true" />
                        <StatusBadge status={drawerStatus.badgeStatus} label={t(drawerStatus.label)} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Processing details')}</div>
                    <div className="mt-2"><PipelineDots document={drawer.document} t={t} /></div>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Language')}</div>
                    <div className="break-words text-gray-950 dark:text-white">
                      {t(detectedLanguageLabel(drawer.document))}
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
                    [t('Media Type'), drawer.document?.media_type],
                    [t('File Size'), drawer.document?.content_length ? `${drawer.document.content_length} ${t('bytes')}` : null],
                    ...(showDiagnostics ? [
                      [t('Content Hash'), drawer.document?.content_hash],
                      [t('Version ID'), drawer.document?.current_file_version_id],
                      [t('Drive File ID'), drawer.document?.source_details?.drive_file_id],
                    ] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{label}</dt>
                      <dd className="mt-1 break-words text-gray-900 dark:text-gray-100">{value || t('Not recorded')}</dd>
                    </div>
                  ))}
                </dl>
                {drawer.document?.source_details?.drive_web_view_link ? (
                  <a
                    href={drawer.document.source_details.drive_web_view_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
                  >
                    <ExternalLink size={15} aria-hidden="true" />
                    {t('Open in Google Drive')}
                  </a>
                ) : null}

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Processing details')}</div>
                  <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t(drawerStatus.userMessage || drawerStatus.description)}</p>
                  <PipelineDots document={drawer.document} showLabels t={t} />
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Issue tags')}</div>
                  <FactorTags document={drawer.document} t={t} />
                </div>

                {drawer.removalError ? <div className="mt-4"><ErrorPanel title={t('Exclude action failed')} error={drawer.removalError} /></div> : null}
                {drawer.removalJob ? (
                  <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <div className="font-semibold">{t(drawer.removalJob.display_status || 'Removed from workspace')}</div>
                    {drawer.removalMessage ? <div className="mt-1">{drawer.removalMessage}</div> : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/evidence/cases/${caseId}/documents/${drawer.document?.file_id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                  >
                    <FileText size={16} aria-hidden="true" />
                    {t('Open document details')}
                  </Link>
                  {(isAudioDocument(drawer.document, drawer.previewContentType) || isVideoDocument(drawer.document, drawer.previewContentType)) && hasTranscript(drawer.document) ? (
                    <button
                      type="button"
                      onClick={() => window.document.getElementById('drawer-transcript')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="inline-flex items-center gap-2 rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:bg-[#101820] dark:text-sky-200 dark:hover:bg-sky-950/40"
                    >
                      <FileText size={16} aria-hidden="true" />
                      {t('View transcript')}
                    </button>
                  ) : null}
                  {canContribute ? (
                    <button
                      type="button"
                      onClick={openRemovalDialog}
                      disabled={drawer.removalBusy || !drawer.document?.file_id}
                      className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/60 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/30"
                      title={t('Choose soft remove or delete the secure workspace copy. The original source file is not deleted.')}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {drawer.removalBusy ? t('Removing') : t('Remove from workspace')}
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Source file preview')}</h3>
                  <StatusBadge status={drawerStatus.badgeStatus} label={t(drawerStatus.label)} />
                </div>
                {drawer.previewLoading ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('Loading source file preview...')}</p>
                ) : (
                  <DocumentPreviewPanel
                    previewUrl={drawer.previewUrl}
                    previewError={drawer.previewError}
                    contentType={drawer.previewContentType || drawer.document?.media_type}
                    fileName={drawer.document?.original_filename}
                    document={drawer.document}
                  />
                )}
              </section>

              {(isAudioDocument(drawer.document, drawer.previewContentType) || isVideoDocument(drawer.document, drawer.previewContentType)) ? (
                <div className="mt-4">
                  <TranscriptPanel document={drawer.document} compact id="drawer-transcript" />
                </div>
              ) : null}

              <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{documentTextSectionLabel(drawer.document, t)}</h3>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {(isAudioDocument(drawer.document) || isVideoDocument(drawer.document))
                      ? t('{size} record(s)', { size: drawer.document?.pages?.length || 0 })
                      : t('{size} page(s)', { size: drawer.document?.pages?.length || 0 })}
                  </span>
                </div>
                <DataTable
                  rows={drawer.document?.pages || []}
                  rowKey={(page) => `${page.page_number}-${page.text_source}`}
                  emptyTitle={drawer.loading ? t('Loading page rows') : t('No page rows returned')}
                  columns={[
                    { key: 'page_number', header: (isAudioDocument(drawer.document) || isVideoDocument(drawer.document)) ? t('Record') : t('Page'), render: (page) => page.page_number },
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
      <DocumentRemovalDialog
        busy={drawer.removalBusy}
        documentName={drawer.document?.original_filename || drawer.document?.file_id}
        hasSecureWorkspaceCopy={Boolean(drawer.document?.s3_key)}
        onClose={closeRemovalDialog}
        onConfirm={excludeDocumentFromProcessing}
        open={Boolean(drawer.open && drawer.removalDialogOpen)}
      />
    </div>
  );
}
