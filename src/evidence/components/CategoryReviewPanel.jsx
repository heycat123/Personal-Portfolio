import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, FileText, Filter, Info, Quote } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocaleSettings } from '../context/LocaleContext';
import { formatCount, humanizeKey } from '../utils/formatters';
import ErrorPanel from './ErrorPanel';
import StatusBadge from './StatusBadge';

function categoryKey(category) {
  return String(category?.category_id || category?.code || category?.label || 'category');
}

function lensId(lens) {
  return String(lens?.lens_id || lens?.id || lens?.value || lens || '');
}

function lensLabel(lens) {
  if (!lens) {
    return '';
  }
  if (typeof lens === 'string') {
    return humanizeKey(lens);
  }
  return lens.label || lens.name || humanizeKey(lens.lens_id || lens.id || lens.value || 'Review lens');
}

function reviewBadgeStatus(status) {
  const normalized = String(status || 'suggested').toLowerCase();
  if (normalized.includes('confirmed')) {
    return { label: humanizeKey(normalized), className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300' };
  }
  return { label: normalized === 'needs_review' ? 'Needs review' : humanizeKey(normalized), className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300' };
}

function ReviewStatusBadge({ status }) {
  const { t } = useLocaleSettings();
  const badge = reviewBadgeStatus(status);
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${badge.className}`}>
      {t(badge.label)}
    </span>
  );
}

function basisLabel(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'lens_spans_available') return 'Source snippets available';
  if (normalized === 'source_metadata_only') return 'Source metadata only';
  if (normalized === 'graph_tag_only') return 'Issue tag only';
  if (normalized === 'needs_lens_review') return 'Needs source-snippet review';
  return normalized ? humanizeKey(normalized) : 'Review basis not recorded';
}

function categoryMatchesView(category, view) {
  if (view === 'all') return true;
  const counts = category?.counts || {};
  if (view === 'needs_review') {
    return category?.review_status === 'needs_review'
      || category?.basis_status === 'needs_lens_review'
      || Number(counts.needs_review || 0) > 0
      || Number(counts.documents_missing_lens_spans || 0) > 0;
  }
  if (view === 'uncategorized') {
    const label = `${category?.category_id || ''} ${category?.code || ''} ${category?.label || ''}`.toLowerCase();
    return label.includes('uncategorized') || Number(counts.uncategorized || 0) > 0 || Number(counts.not_tagged || 0) > 0;
  }
  if (view === 'by_category') {
    return category?.kind === 'document_category';
  }
  return true;
}

function CountCard({ label, value, tone = 'default' }) {
  const toneClass = tone === 'good'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'review'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-gray-950 dark:text-white';
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-black/20">
      <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{formatCount(value || 0)}</div>
    </div>
  );
}

function categoryKindLabel(kind) {
  const normalized = String(kind || '').toLowerCase();
  if (normalized === 'document_category') return 'Category group';
  if (normalized === 'issue_tag') return 'Issue tag';
  if (normalized === 'lens_factor') return 'Review lens factor';
  return 'Category group';
}

function categoryDisplayTitle(category) {
  const code = category?.code ? String(category.code).toUpperCase() : '';
  const rawLabel = category?.label || category?.category_id || 'Unnamed category';
  const label = code && String(rawLabel).toUpperCase().startsWith(code)
    ? String(rawLabel).replace(new RegExp(`^${code}\\s*[-:]*\\s*`, 'i'), '')
    : rawLabel;
  if (category?.kind === 'document_category') {
    return `Category: ${label}`;
  }
  if (category?.kind === 'issue_tag') {
    return `${code ? `${code} - ` : ''}Issue tag: ${label}`;
  }
  if (category?.kind === 'lens_factor') {
    return `${code ? `${code} - ` : ''}Review lens: ${label}`;
  }
  return code ? `${code} - ${label}` : label;
}

function reviewNeeds(category, spanLookup, t) {
  const counts = category?.counts || {};
  const documentRows = Number(counts.document_rows || 0);
  const readyForSearch = Number(counts.ready_for_search || 0);
  const missingSpans = Number(counts.documents_missing_lens_spans || 0);
  const needsReview = Number(counts.needs_review || 0);
  const uncategorized = Number(counts.uncategorized || 0);
  const notTagged = Number(counts.not_tagged || 0);
  const unavailableSpans = category?.basis_status === 'needs_lens_review'
    || category?.basis_status === 'graph_tag_only'
    || category?.basis_status === 'source_metadata_only'
    || spanLookup?.available === false;
  const items = [];

  if (missingSpans > 0 || unavailableSpans) {
    items.push({
      label: t('Source snippets missing'),
      detail: missingSpans > 0
        ? t('{count} document row(s) do not have generated quotes or snippets for this review lens yet.', { count: missingSpans })
        : t('This review lens has not generated quotes or snippets for this category yet.'),
      action: t('Treat this as an organizational suggestion until lens review runs or a person confirms the category.'),
    });
  }

  if (needsReview > 0) {
    items.push({
      label: t('Documents need attention'),
      detail: t('{count} document row(s) in this group are marked needs review by document processing or source status.', { count: needsReview }),
      action: t('Show matching documents, then review source copy, extracted text, and category details.'),
    });
  }

  if (documentRows > 0 && readyForSearch < documentRows) {
    items.push({
      label: t('Search readiness incomplete'),
      detail: t('{ready} of {total} document row(s) are ready for search and Q&A.', { ready: readyForSearch, total: documentRows }),
      action: t('Review document processing before relying on Ask Documents for this category.'),
    });
  }

  if (uncategorized > 0 || notTagged > 0) {
    items.push({
      label: t('Category or issue tag missing'),
      detail: t('Some documents in this review set are uncategorized or have no suggested issue tag.'),
      action: t('Review uncategorized documents before handoff.'),
    });
  }

  if (String(category?.review_status || '').toLowerCase() === 'suggested') {
    items.push({
      label: t('Human confirmation needed'),
      detail: t('This grouping is suggested by workspace metadata, issue tags, or review-lens output.'),
      action: t('A user or lawyer should open the source documents before treating the grouping as ready for handoff.'),
    });
  }

  if (!items.length) {
    items.push({
      label: t('Ready for review'),
      detail: t('No category-specific review blocker was returned for this group.'),
      action: t('Open representative documents and review source snippets before sharing with a lawyer.'),
    });
  }

  return items;
}

function categoryReason(category, spanLookup, t) {
  if (!category) {
    return '';
  }
  if (category.basis_status === 'lens_spans_available') {
    return t('This grouping includes source snippets from the selected review lens. Review the cited snippets and open the source documents before relying on a summary.');
  }
  if (category.basis_status === 'graph_tag_only') {
    return t('This grouping is based on issue tags from document processing. This lens has not generated source snippets for this category yet.');
  }
  if (category.basis_status === 'source_metadata_only') {
    return t('This grouping is based on document metadata and category labels. This lens has not generated source snippets for this category yet.');
  }
  if (category.basis_status === 'needs_lens_review') {
    return t('This category needs source-snippet review before generated quotes can explain the grouping.');
  }
  if (spanLookup?.available === false) {
    return t('This review lens has not generated source snippets yet.');
  }
  return t('Review the representative documents and source status to understand this category.');
}

function spanLookupReasonMessage(reason, t) {
  const normalized = String(reason || '').toLowerCase();
  if (
    normalized.includes('lens_span')
    || normalized.includes('span_table')
    || normalized.includes('unavailable')
    || normalized.includes('not_run')
    || normalized.includes('not run')
    || normalized.includes('missing')
  ) {
    return t('This review lens has not generated quotes or source snippets yet. Categories shown here are organizational suggestions until lens review runs or a person confirms them.');
  }
  if (normalized.includes('version')) {
    return t('Some quote-level review data was produced with a different review lens version. Ask support to refresh the review lens before handoff.');
  }
  return reason || t('Category summaries may be based on metadata or issue tags until source snippets are available.');
}

function exceptionMessage(exception, t) {
  const normalized = String(exception?.resolution?.issue_state || exception?.exception_type || exception?.type || exception?.code || '').toLowerCase();
  if (normalized.includes('uncategorized')) {
    return t('Some documents are not assigned to a category yet. Review the Documents list before lawyer handoff.');
  }
  if (normalized.includes('no_extracted_text') || normalized.includes('text') || normalized.includes('extraction')) {
    return t('Some documents do not have extracted text yet. Review text/search processing before using category summaries for handoff.');
  }
  if (normalized.includes('lens_spans_unavailable') || normalized.includes('span')) {
    return t('This review lens has not generated quotes or source snippets yet. Categories shown here are organizational suggestions until lens review runs or a person confirms them.');
  }
  if (normalized.includes('lens_version_mismatch') || normalized.includes('version')) {
    return t('Some quote-level review data was produced with a different review lens version. Ask support to refresh the review lens before handoff.');
  }
  if (normalized.includes('removed') || normalized.includes('excluded')) {
    return t('Some documents have been removed or excluded from processing or source coverage. Review the Documents list if they should be included.');
  }
  const backendMessage = exception?.resolution?.user_message || exception?.next_action?.user_message;
  if (backendMessage) {
    return t(backendMessage);
  }
  return exception?.detail || exception?.message || exception?.resolution?.user_message || exception?.reason || t('This item needs review before category review is complete.');
}

function docName(document) {
  return document?.filename || document?.original_filename || document?.file_id || document?.document_id || 'Document';
}

function docIssueTags(document) {
  const codes = Array.isArray(document?.issue_tag_codes)
    ? document.issue_tag_codes
    : [];
  const tags = Array.isArray(document?.organizational_issue_tags)
    ? document.organizational_issue_tags
    : [];
  if (!codes.length && !tags.length) {
    return [];
  }
  const fromCodes = codes.map((code) => {
    const match = tags.find((tag) => String(tag.issue_tag_code || '').toLowerCase() === String(code).toLowerCase());
    return {
      code,
      label: match?.display_label || match?.issue_tag_label || humanizeKey(code),
    };
  });
  const extraTags = tags
    .filter((tag) => !fromCodes.find((item) => String(item.code).toLowerCase() === String(tag.issue_tag_code || '').toLowerCase()))
    .map((tag) => ({
      code: tag.issue_tag_code || tag.display_label || tag.issue_tag_label,
      label: tag.display_label || tag.issue_tag_label || humanizeKey(tag.issue_tag_code),
    }));
  return [...fromCodes, ...extraTags].filter((item) => item.label);
}

function LensSpan({ span }) {
  const { t } = useLocaleSettings();
  const snippet = span?.snippet || span?.quote || '';
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Quote size={14} aria-hidden="true" />
        <span className="font-semibold">{span?.factor_name || span?.factor_code || t('Source snippet')}</span>
        {span?.factor_citation ? <span className="text-xs opacity-80">{span.factor_citation}</span> : null}
        {span?.page_number ? <span className="text-xs opacity-80">{t('Page')} {span.page_number}</span> : null}
      </div>
      {snippet ? <p className="leading-6">{snippet}</p> : <p>{t('No snippet text returned for this lens span.')}</p>}
      {(span?.why_material || span?.limitations) ? (
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          {span.why_material ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-normal opacity-75">{t('Why this matters')}</dt>
              <dd className="mt-1">{span.why_material}</dd>
            </div>
          ) : null}
          {span.limitations ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-normal opacity-75">{t('Limitations')}</dt>
              <dd className="mt-1">{span.limitations}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {(span?.quote_verification || span?.quote_match_ratio) ? (
        <div className="mt-2 text-xs opacity-80">
          {span.quote_verification ? `${t('Quote check')}: ${humanizeKey(span.quote_verification)}` : null}
          {span.quote_match_ratio !== undefined && span.quote_match_ratio !== null ? ` | ${t('Match')}: ${span.quote_match_ratio}` : null}
        </div>
      ) : null}
    </div>
  );
}

function RepresentativeDocument({ document, caseId }) {
  const { t } = useLocaleSettings();
  const fileId = document?.file_id || document?.document_id;
  const spans = Array.isArray(document?.lens_spans) ? document.lens_spans : [];
  const tags = docIssueTags(document);
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h4 className="break-words text-sm font-semibold text-gray-950 dark:text-white">{docName(document)}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <span>{document?.source_label || t('Source file')}</span>
            {document?.readiness?.label || document?.readiness ? <StatusBadge status={document?.readiness?.status || document?.readiness} label={document?.readiness?.label || humanizeKey(document.readiness)} /> : null}
            {document?.document_review_state ? <StatusBadge status={document.document_review_state} label={humanizeKey(document.document_review_state)} /> : null}
          </div>
          {document?.evidence_classification?.label ? (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold">{t('Category')}:</span> {document.evidence_classification.label}
            </p>
          ) : null}
          {tags.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span key={`${tag.code}-${tag.label}`} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-900 dark:border-indigo-900/70 dark:bg-indigo-950/50 dark:text-indigo-100">
                  {tag.code ? `${String(tag.code).toUpperCase()} - ` : ''}{tag.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {fileId ? (
          <Link
            to={`/evidence/cases/${caseId}/documents/${fileId}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <ExternalLink size={15} aria-hidden="true" />
            {t('Open document')}
          </Link>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {spans.length ? (
          spans.slice(0, 3).map((span, index) => <LensSpan key={`${span?.source_text_hash || span?.factor_code || 'span'}-${index}`} span={span} />)
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
            <div className="font-semibold">{t('Source snippets not generated yet')}</div>
            <p className="mt-1">{document?.why_missing || t('This document is represented by category metadata or issue tags, but this review lens has not returned a source snippet for it yet.')}</p>
          </div>
        )}
      </div>
    </article>
  );
}

function exceptionAction(exception, caseId, onFilterUncategorized, t) {
  const resolution = exception?.resolution || {};
  const action = resolution.next_action || exception?.next_action || {};
  const routeHint = action.route_hint || resolution.route_hint;
  if (routeHint && String(routeHint).startsWith('/')) {
    return {
      label: t(action.label || action.action_label || resolution.action_label || 'Open details'),
      to: routeHint,
    };
  }
  const text = `${resolution.issue_state || ''} ${exception?.exception_type || ''} ${exception?.type || ''} ${exception?.code || ''} ${exception?.category || ''} ${exception?.reason || ''}`.toLowerCase();
  if (text.includes('uncategorized')) {
    return {
      label: t('Review uncategorized documents'),
      onClick: onFilterUncategorized,
    };
  }
  if (text.includes('text') || text.includes('processing') || text.includes('extraction')) {
    return { label: t('See text/search processing'), to: `/evidence/cases/${caseId}/jobs#processing-status` };
  }
  if (text.includes('span') || text.includes('lens') || text.includes('version')) {
    return { label: t('Review category actions'), to: '#category-review-actions' };
  }
  if (text.includes('excluded') || text.includes('removed')) {
    return { label: t('Open Documents'), to: `/evidence/cases/${caseId}/documents` };
  }
  return { label: t('Open Documents'), to: `/evidence/cases/${caseId}/documents` };
}

function ExceptionsList({ exceptions, caseId, onFilterUncategorized }) {
  const { t } = useLocaleSettings();
  if (!Array.isArray(exceptions) || !exceptions.length) {
    return null;
  }
  return (
    <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        <div>
          <h3 className="font-semibold">{t('Items to review before handoff')}</h3>
          <p className="mt-1">{t('These items need a quick review before the category summary is ready to share for workspace organization.')}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {exceptions.map((exception, index) => {
          const action = exceptionAction(exception, caseId, onFilterUncategorized, t);
          const count = exception.count ?? exception.document_rows ?? exception.unique_file_hashes ?? exception.total ?? null;
          return (
            <article key={`${exception?.exception_type || exception?.type || exception?.code || 'exception'}-${index}`} className="rounded-md border border-amber-200 bg-white/80 p-3 dark:border-amber-900/60 dark:bg-black/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold">{exception.label || exception.title || humanizeKey(exception.exception_type || exception.type || exception.code || exception.category || 'Needs review')}</div>
                  <p className="mt-1 text-amber-900 dark:text-amber-100">{exceptionMessage(exception, t)}</p>
                  {count !== null ? <div className="mt-1 text-xs font-semibold">{formatCount(count)} {t('item(s)')}</div> : null}
                </div>
                {action.to ? (
                  <Link to={action.to} className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40">
                    {action.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={action.onClick}
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function routeForAction(action, caseId) {
  const route = action?.next_route_hint || action?.route_hint || action?.next_action?.route_hint || action?.resolution?.route_hint;
  if (!route) {
    return null;
  }
  if (String(route).startsWith('/')) {
    return route;
  }
  if (String(route).startsWith('jobs')) {
    return `/evidence/cases/${caseId}/${route}`;
  }
  if (String(route).startsWith('#')) {
    return route;
  }
  return `/evidence/cases/${caseId}/${route}`;
}

function actionTitle(action) {
  return action?.label || action?.title || action?.display_status || humanizeKey(action?.action_id || action?.status || 'Review action');
}

function actionMessage(action) {
  const text = `${action?.status || ''} ${action?.workflow_status || ''} ${action?.issue_state || ''} ${action?.action_id || ''}`.toLowerCase();
  if (text.includes('operator_runtime_required') || text.includes('relationship_map')) {
    return 'Relationship-map update needs graph-processing runtime. This is not self-service yet; you can keep reviewing documents while operator processing is prepared.';
  }
  if (text.includes('lens_review_job_not_available') || text.includes('run_lens_review')) {
    return 'Category snippets have not been generated yet. Source-snippet review is not self-service yet, so this category remains an organizational suggestion until that review runs or a person confirms it.';
  }
  return action?.display_message
    || action?.message
    || action?.resolution?.user_message
    || action?.next_action?.user_message
    || action?.description
    || 'Review this item before category review is complete.';
}

function actionCount(action) {
  return action?.count
    ?? action?.document_rows
    ?? action?.affected_document_count
    ?? action?.affected_count
    ?? action?.sample_count
    ?? null;
}

function actionSampleNames(action) {
  const samples = action?.samples || action?.affected_samples || action?.sample_documents || action?.documents || [];
  if (!Array.isArray(samples)) {
    return [];
  }
  return samples
    .map((sample) => sample?.filename || sample?.original_filename || sample?.file_name || sample?.file_id || sample?.document_id)
    .filter(Boolean)
    .slice(0, 3);
}

function actionTone(action) {
  const status = String(action?.status || action?.workflow_status || '').toLowerCase();
  if (status.includes('blocked') || status.includes('not_available') || status.includes('operator_runtime_required')) {
    return 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100';
  }
  if (action?.can_execute) {
    return 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100';
  }
  return 'border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-100';
}

function ResolveActionsPanel({
  actions,
  busyActionId,
  caseId,
  error,
  loading,
  onRefresh,
  onResolveAction,
  result,
}) {
  const { t } = useLocaleSettings();
  const [confirmAction, setConfirmAction] = useState(null);
  const visibleActions = Array.isArray(actions) ? actions : [];

  if (!loading && !error && !visibleActions.length && !result) {
    return null;
  }

  const handleActionClick = (action) => {
    if (action?.requires_confirmation) {
      setConfirmAction(action);
      return;
    }
    onResolveAction?.(action, {});
  };

  const confirmAndRun = () => {
    if (!confirmAction) {
      return;
    }
    onResolveAction?.(confirmAction, { confirm_review: true });
    setConfirmAction(null);
  };

  return (
    <section id="category-review-actions" className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold">{t('Resolve review items')}</h3>
          <p className="mt-1">{t('Use these actions to move category review forward. Actions that mark items reviewed require your confirmation first.')}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-950 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-[#101820] dark:text-sky-100 dark:hover:bg-sky-950/40"
        >
          {loading ? t('Loading') : t('Refresh actions')}
        </button>
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorPanel title={t('Review actions unavailable')} error={error} onRetry={onRefresh} />
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="font-semibold">{t(result.display_status || result.display_message || 'Category review updated')}</div>
          {result.display_message && result.display_status ? <p className="mt-1">{t(result.display_message)}</p> : null}
          {result.next_route_hint ? (
            <Link to={routeForAction({ next_route_hint: result.next_route_hint }, caseId)} className="mt-2 inline-flex rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-[#101820] dark:text-emerald-100 dark:hover:bg-emerald-950/40">
              {t('Open next step')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {visibleActions.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {visibleActions.map((action) => {
            const actionId = action?.action_id || action?.id || action?.status || actionTitle(action);
            const actionStatus = `${action?.status || ''} ${action?.workflow_status || ''} ${action?.issue_state || ''}`.toLowerCase();
            const operatorRuntimeRequired = actionStatus.includes('operator_runtime_required') || String(actionId).includes('relationship_map');
            const route = operatorRuntimeRequired ? null : routeForAction(action, caseId);
            const count = actionCount(action);
            const sampleNames = actionSampleNames(action);
            const disabled = Boolean(busyActionId) || (!action?.can_execute && !route);
            const blocked = !action?.can_execute && !route;
            const buttonLabel = action?.button_label
              || action?.next_action?.label
              || action?.resolution?.action_label
              || (action?.requires_confirmation ? 'Review and confirm' : action?.can_execute ? 'Start action' : 'Not available yet');
            return (
              <article key={actionId} className={`rounded-md border p-3 ${actionTone(action)}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold">{t(actionTitle(action))}</div>
                    <p className="mt-1">{t(actionMessage(action))}</p>
                    {count !== null ? <div className="mt-1 text-xs font-semibold">{formatCount(count)} {t(action?.unit || 'item(s)')}</div> : null}
                    {sampleNames.length ? (
                      <div className="mt-2 text-xs opacity-85">
                        {t('Examples')}: {sampleNames.join(', ')}
                      </div>
                    ) : null}
                    {blocked ? (
                      <div className="mt-2 text-xs font-semibold">{t('No self-service action is available for this item yet. You can keep reviewing documents while this is being prepared.')}</div>
                    ) : null}
                  </div>
                  {route ? (
                    <Link to={route} className="inline-flex shrink-0 items-center justify-center rounded-md border border-current/30 bg-white px-3 py-2 text-xs font-semibold hover:bg-black/5 dark:bg-[#101820] dark:hover:bg-white/10">
                      {t(buttonLabel)}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleActionClick(action)}
                      disabled={disabled}
                      className="inline-flex shrink-0 items-center justify-center rounded-md border border-current/30 bg-white px-3 py-2 text-xs font-semibold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#101820] dark:hover:bg-white/10"
                    >
                      {busyActionId === actionId ? t('Working') : t(buttonLabel)}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : loading ? (
        <div className="mt-3 rounded-md border border-sky-200 bg-white/80 p-3 dark:border-sky-900/60 dark:bg-black/20">
          {t('Loading review actions.')}
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-lg font-semibold text-gray-950 dark:text-white">{t('Confirm category review action')}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
              {t(actionMessage(confirmAction))}
            </p>
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
              {t('This marks organizational review work as reviewed. It does not decide legal importance, completeness, or whether a legal requirement is satisfied.')}
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                {t('Keep reviewing')}
              </button>
              <button
                type="button"
                onClick={confirmAndRun}
                className="rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              >
                {t('Confirm reviewed')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function CategoryReviewPanel({
  caseId,
  data,
  error,
  exportBusy = false,
  loading = false,
  lensId: selectedLensId,
  onLoadResolvePlan,
  onExportCurrentView,
  onFilterCategory,
  onFilterUncategorized,
  onLensChange,
  onRetry,
  onResolveAction,
  resolveActionBusyId,
  resolveError,
  resolveLoading = false,
  resolvePlan,
  resolveResult,
}) {
  const { t } = useLocaleSettings();
  const [activeView, setActiveView] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({
    document_category: true,
    issue_tag: true,
    lens_factor: true,
    other: true,
  });
  const summaries = useMemo(() => (
    Array.isArray(data?.category_summaries) ? data.category_summaries : []
  ), [data]);
  const filteredSummaries = useMemo(() => summaries.filter((category) => categoryMatchesView(category, activeView)), [activeView, summaries]);
  const selectedCategory = filteredSummaries.find((category) => categoryKey(category) === selectedKey) || filteredSummaries[0] || null;
  const selectedReviewNeeds = useMemo(() => reviewNeeds(selectedCategory, data?.span_lookup || {}, t), [data?.span_lookup, selectedCategory, t]);
  const groupedSummaries = useMemo(() => {
    const groups = [
      { id: 'document_category', label: 'Document categories', items: [] },
      { id: 'issue_tag', label: 'Issue tags', items: [] },
      { id: 'lens_factor', label: 'Review lens factors', items: [] },
      { id: 'other', label: 'Other review groups', items: [] },
    ];
    const groupMap = Object.fromEntries(groups.map((group) => [group.id, group]));
    filteredSummaries.forEach((category) => {
      const kind = ['document_category', 'issue_tag', 'lens_factor'].includes(category?.kind) ? category.kind : 'other';
      groupMap[kind].items.push(category);
    });
    return groups.filter((group) => group.items.length);
  }, [filteredSummaries]);
  const guardrail = data?.guardrail || {};
  const displayTerms = guardrail.display_terms || {};
  const configuredLenses = Array.isArray(data?.configured_lenses) ? data.configured_lenses : [];
  const activeLens = data?.active_lens || configuredLenses.find((lens) => lensId(lens) === selectedLensId) || selectedLensId;
  const totals = data?.totals || {};
  const spanLookup = data?.span_lookup || {};
  const tabs = [
    { id: 'all', label: 'All groups' },
    { id: 'needs_review', label: 'Needs review' },
    { id: 'uncategorized', label: 'Uncategorized' },
    { id: 'by_category', label: 'Categories' },
  ];

  return (
    <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]" id="category-review">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Category review')}</div>
          <h2 className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{t('Category review for lawyer handoff')}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
            {t('This review helps you and your lawyer see how documents are grouped. It is for organization and review only.')}
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
            {guardrail.message || t('Categories and issue tags are organizational review aids. They do not decide legal importance, completeness, or whether a legal requirement is satisfied.')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
          {configuredLenses.length ? (
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
              {t('Review lens')}
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-[#0c1218] dark:text-gray-100"
                onChange={(event) => onLensChange?.(event.target.value)}
                value={selectedLensId || data?.filters?.lens_id || ''}
              >
                {configuredLenses.map((lens) => (
                  <option key={lensId(lens)} value={lensId(lens)}>{lensLabel(lens)}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-black/20">
              <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Review lens')}</div>
              <div className="font-semibold text-gray-950 dark:text-white">{lensLabel(activeLens) || t('Current review lens')}</div>
            </div>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            {loading ? t('Loading') : t('Refresh category review')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorPanel
            title={t('Category review unavailable')}
            error={error}
            onRetry={onRetry}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <CountCard label={t('Document rows')} value={totals.total_visible_document_rows ?? totals.document_rows_considered} />
        <CountCard label={t('Rows considered')} value={totals.document_rows_considered} />
        <CountCard label={t('Unique files')} value={totals.unique_file_hashes_considered} />
        <CountCard label={t('Lens span rows')} value={totals.lens_span_rows} tone={Number(totals.lens_span_rows || 0) > 0 ? 'good' : 'review'} />
        <CountCard label={t('Max rows')} value={totals.max_document_rows} />
      </div>

      {totals.result_limited ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          {t('This category review is limited to the returned document rows. Refine filters or ask support if the handoff needs a larger review set.')}
        </div>
      ) : null}

      {spanLookup.available === false ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="font-semibold">{t('Source snippets not generated yet')}</div>
          <p className="mt-1">{spanLookupReasonMessage(spanLookup.reason, t)}</p>
        </div>
      ) : null}

      <ExceptionsList exceptions={data?.exceptions || []} caseId={caseId} onFilterUncategorized={onFilterUncategorized} />

      <ResolveActionsPanel
        actions={resolvePlan?.actions || []}
        busyActionId={resolveActionBusyId}
        caseId={caseId}
        error={resolveError}
        loading={resolveLoading}
        onRefresh={onLoadResolvePlan}
        onResolveAction={onResolveAction}
        result={resolveResult}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveView(tab.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              activeView === tab.id
                ? 'border-sky-700 bg-sky-700 text-white'
                : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:border-gray-700 dark:bg-black/20 dark:text-gray-200 dark:hover:border-sky-900 dark:hover:bg-sky-950/30'
            }`}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {activeView === 'by_category'
          ? t('Categories shows document-level category groups, separate from issue tags and review-lens factors.')
          : t('Use these tabs to narrow the review list, then expand a group to inspect category, issue-tag, or review-lens items.')}
      </p>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.6fr)]">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-black/20">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Review groups')}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{formatCount(filteredSummaries.length)} {t('shown')}</span>
          </div>
          <div className="max-h-[32rem] space-y-2 overflow-auto pr-1">
            {loading ? (
              <div className="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                {t('Loading category review.')}
              </div>
            ) : groupedSummaries.length ? groupedSummaries.map((group) => {
              const expanded = expandedGroups[group.id] !== false;
              return (
                <section key={group.id} className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#101820]">
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !expanded }))}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-gray-950 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                      <span className="truncate">{t(group.label)}</span>
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-black/30 dark:text-gray-300">{formatCount(group.items.length)}</span>
                  </button>
                  {expanded ? (
                    <div className="space-y-2 border-t border-gray-200 p-2 dark:border-gray-800">
                      {group.items.map((category) => {
                        const counts = category.counts || {};
                        const selected = categoryKey(category) === categoryKey(selectedCategory);
                        const needs = reviewNeeds(category, spanLookup, t);
                        const topNeed = needs[0];
                        return (
                          <button
                            key={categoryKey(category)}
                            type="button"
                            onClick={() => setSelectedKey(categoryKey(category))}
                            className={`w-full rounded-md border p-3 text-left transition ${
                              selected
                                ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20 dark:border-sky-800 dark:bg-sky-950/25'
                                : 'border-gray-200 bg-white hover:border-sky-300 hover:bg-sky-50/60 dark:border-gray-800 dark:bg-[#101820] dark:hover:border-sky-900 dark:hover:bg-sky-950/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="break-words text-sm font-semibold text-gray-950 dark:text-white">{t(categoryDisplayTitle(category))}</div>
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(categoryKindLabel(category.kind))}</div>
                              </div>
                              <ReviewStatusBadge status={category.review_status} />
                            </div>
                            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
                              <span className="font-semibold">{topNeed.label}:</span> {topNeed.detail}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <span>{formatCount(counts.document_rows)} {t('document rows')}</span>
                              <span>{formatCount(counts.unique_file_hashes)} {t('unique files')}</span>
                              <span>{formatCount(counts.ready_for_search)} {t('ready')}</span>
                              <span>{formatCount(counts.needs_review)} {t('needs review')}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            }) : (
              <div className="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
                {t('No category rows matched this review tab.')}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#101820]">
          {selectedCategory ? (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(categoryKindLabel(selectedCategory.kind))}</div>
                  <h3 className="mt-1 break-words text-lg font-semibold text-gray-950 dark:text-white">{t(categoryDisplayTitle(selectedCategory))}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ReviewStatusBadge status={selectedCategory.review_status} />
                    <StatusBadge status={selectedCategory.basis_status === 'lens_spans_available' ? 'configured' : 'needs_review'} label={basisLabel(selectedCategory.basis_status)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onFilterCategory?.(selectedCategory)}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <Filter size={15} aria-hidden="true" />
                    {t('Show matching documents')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportCurrentView?.(selectedCategory)}
                    disabled={exportBusy}
                    title={t('Export documents that match this selected category or issue tag.')}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <FileText size={15} aria-hidden="true" />
                    {exportBusy ? t('Exporting') : t('Export category review')}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t('Show matching documents filters the document table below to this category or issue tag. Export category review uses the selected category filter even if the table is currently showing something else.')}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <CountCard label={t('Document rows')} value={selectedCategory.counts?.document_rows} />
                <CountCard label={t('Unique files')} value={selectedCategory.counts?.unique_file_hashes} />
                <CountCard label={t('Ready for search')} value={selectedCategory.counts?.ready_for_search} tone="good" />
                <CountCard label={t('Needs review')} value={selectedCategory.counts?.needs_review} tone="review" />
              </div>

              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
                <div className="font-semibold">{t('What needs review')}</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {selectedReviewNeeds.map((item) => (
                    <div key={`${item.label}-${item.detail}`} className="rounded-md border border-amber-200 bg-white/80 p-3 dark:border-amber-900/60 dark:bg-black/20">
                      <div className="font-semibold">{item.label}</div>
                      <p className="mt-1">{item.detail}</p>
                      <p className="mt-2 text-xs font-semibold">{item.action}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-black/20">
                  <div className="font-semibold text-gray-950 dark:text-white">{t(displayTerms.category_summary || 'Category summary')}</div>
                  <p className="mt-2 leading-6 text-gray-700 dark:text-gray-300">
                    {selectedCategory.category_summary || t('No category summary has been returned yet. Review representative documents and source status before lawyer handoff.')}
                  </p>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-black/20">
                  <div className="font-semibold text-gray-950 dark:text-white">{t(displayTerms.grouping_reason || 'Why this is grouped here')}</div>
                  <p className="mt-2 leading-6 text-gray-700 dark:text-gray-300">
                    {categoryReason(selectedCategory, spanLookup, t)}
                  </p>
                </div>
              </div>

              {Number(selectedCategory.counts?.documents_missing_lens_spans || 0) > 0 ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
                  <div className="font-semibold">{t('Source snippets not generated yet')}</div>
                  <p className="mt-1">
                    {t('{count} document row(s) in this category do not have generated quotes or source snippets for this review lens yet. The category remains an organizational suggestion until lens review runs or a person confirms it.', { count: selectedCategory.counts.documents_missing_lens_spans })}
                  </p>
                </div>
              ) : null}

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-gray-950 dark:text-white">{t('Representative documents')}</h4>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{formatCount(selectedCategory.representative_documents?.length || 0)} {t('shown')}</span>
                </div>
                <div className="space-y-3">
                  {Array.isArray(selectedCategory.representative_documents) && selectedCategory.representative_documents.length ? (
                    selectedCategory.representative_documents.map((document, index) => (
                      <RepresentativeDocument key={`${document?.file_id || document?.document_id || docName(document)}-${index}`} document={document} caseId={caseId} />
                    ))
                  ) : (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-black/20 dark:text-gray-400">
                      {t('No representative documents were returned for this category.')}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-black/20 dark:text-gray-400">
              {t('No category summary rows are available yet.')}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          <p>{t('Category review uses source documents, snippets, and review status for lawyer handoff. Some review work can be started here; items without a self-service action will say what is still being prepared.')}</p>
        </div>
      </div>
    </section>
  );
}
