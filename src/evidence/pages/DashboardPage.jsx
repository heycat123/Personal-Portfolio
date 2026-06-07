import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Cloud,
  FileText,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AnimatedCount from '../components/AnimatedCount';
import ErrorPanel from '../components/ErrorPanel';
import NeedsAttentionPanel from '../components/NeedsAttentionPanel';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { buildCaseAttentionItems, filterAttentionItems } from '../utils/caseAttention';
import { formatDateTime, humanizeKey, sumCounts } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

function resolvePlanUnavailable(error) {
  return [404, 502, 503, 504].includes(Number(error?.status));
}

function latestConnectorTime(connection) {
  return connection?.last_successful_sync_at
    || connection?.last_synced_at
    || connection?.last_sync_at
    || connection?.updated_at
    || connection?.created_at
    || null;
}

function statusTone(status) {
  if (status === 'ready') {
    return {
      icon: CheckCircle2,
      iconClass: 'text-[var(--lakai-ready)]',
      border: 'border-[var(--lakai-border-soft)]',
      background: 'bg-[var(--lakai-surface)]',
      badge: 'configured',
    };
  }
  if (status === 'working') {
    return {
      icon: Activity,
      iconClass: 'text-[var(--lakai-primary)]',
      border: 'border-[var(--lakai-border-soft)]',
      background: 'bg-[var(--lakai-accent-soft)]',
      badge: 'running',
    };
  }
  return {
    icon: CircleAlert,
    iconClass: 'text-[var(--lakai-review)]',
    border: 'border-[var(--lakai-border-soft)]',
    background: 'bg-[var(--lakai-surface)]',
    badge: 'pending',
  };
}

function ReadinessCard({ title, status, label, detail, actionLabel, to }) {
  const tone = statusTone(status);
  const Icon = tone.icon;
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${tone.border} ${tone.background}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] p-2">
            <Icon className={tone.iconClass} size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--lakai-text)]">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--lakai-text-muted)]">{detail}</p>
          </div>
        </div>
        <StatusBadge status={tone.badge} label={label} />
      </div>
      {to && actionLabel ? (
        <Link
          to={to}
          className="mt-4 inline-flex min-h-10 items-center rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--lakai-primary-strong)] hover:border-[var(--lakai-primary)] hover:bg-[var(--lakai-accent-soft)]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

function QuickActionCard({ icon, title, detail, to, tone = 'default' }) {
  const toneClasses = {
    default: 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] hover:border-[var(--lakai-primary)]',
    primary: 'border-[var(--lakai-primary)] bg-[var(--lakai-accent-soft)] hover:border-[var(--lakai-primary-strong)]',
    good: 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] hover:border-[var(--lakai-ready)]',
  };
  return (
    <Link
      to={to}
      className={`block rounded-2xl border p-4 shadow-sm transition-colors ${toneClasses[tone] || toneClasses.default}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] p-2 text-[var(--lakai-primary-strong)]">
          {createElement(icon, { size: 18, 'aria-hidden': true })}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--lakai-text)]">{title}</div>
          <div className="mt-1 text-sm leading-5 text-[var(--lakai-text-muted)]">{detail}</div>
        </div>
      </div>
    </Link>
  );
}

function PendingProcessingText({ count, suffix }) {
  return (
    <>
      <AnimatedCount value={count} className="font-semibold" /> {suffix}
    </>
  );
}

function ReviewCard({ icon, title, detail, to, count, countLabel }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] p-4 shadow-sm transition-colors hover:border-[var(--lakai-primary)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] p-2 text-[var(--lakai-primary-strong)]">
            {createElement(icon, { size: 18, 'aria-hidden': true })}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--lakai-text)]">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--lakai-text-muted)]">{detail}</p>
          </div>
        </div>
        {Number.isFinite(count) ? (
          <div className="shrink-0 rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--lakai-primary-strong)]">
            <AnimatedCount value={count} /> {countLabel}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function actionId(action) {
  return action?.action_id || action?.id || action?.type || action?.status || 'readiness_action';
}

function actionLabel(action) {
  return action?.label || action?.title || humanizeKey(actionId(action));
}

function actionMessage(action) {
  const text = `${action?.status || ''} ${action?.workflow_status || ''} ${action?.issue_state || ''} ${actionId(action)}`.toLowerCase();
  if (text.includes('operator_runtime_required') || text.includes('relationship_map')) {
    return 'Relationship-map update needs graph-processing runtime. This is not self-service yet; safe fixes can still run for other readiness items.';
  }
  return action?.display_message
    || action?.message
    || action?.description
    || action?.resolution?.user_message
    || action?.detail
    || null;
}

function actionCount(action) {
  const value = action?.count
    ?? action?.document_rows
    ?? action?.affected_count
    ?? action?.affected_document_count
    ?? action?.sample_count;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function actionSamples(action) {
  const samples = action?.samples
    || action?.sample_documents
    || action?.affected_samples
    || action?.files
    || [];
  return Array.isArray(samples) ? samples.slice(0, 4) : [];
}

function sampleName(sample) {
  return sample?.filename || sample?.original_filename || sample?.name || sample?.file_id || sample?.document_id || String(sample || '');
}

function ResolveActionGroup({ title, detail, actions = [], tone = 'info' }) {
  const toneClasses = {
    safe: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100',
    info: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100',
  };
  const badgeTone = tone === 'safe' ? 'configured' : tone === 'warn' ? 'degraded' : 'running';
  return (
    <div className={`rounded-lg border p-3 ${toneClasses[tone] || toneClasses.info}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 opacity-90">{detail}</p>
        </div>
        <StatusBadge status={badgeTone} label={`${actions.length}`} />
      </div>
      {actions.length ? (
        <div className="mt-3 space-y-2">
          {actions.map((action) => {
            const count = actionCount(action);
            const samples = actionSamples(action);
            return (
              <article key={`${actionId(action)}-${actionLabel(action)}`} className="rounded-md border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-[#101820]/70">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{actionLabel(action)}</div>
                  {count !== null ? (
                    <span className="rounded-full border border-black/10 px-2 py-0.5 text-xs font-semibold dark:border-white/10">
                      <AnimatedCount value={count} /> {action?.unit || action?.count_label || 'item(s)'}
                    </span>
                  ) : null}
                </div>
                {actionMessage(action) ? <p className="mt-1 text-xs leading-5 opacity-90">{actionMessage(action)}</p> : null}
                {samples.length ? (
                  <ul className="mt-2 space-y-1 text-xs opacity-90">
                    {samples.map((sample, index) => (
                      <li key={`${sampleName(sample)}-${index}`} className="break-words">
                        {sampleName(sample)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs opacity-80">No items in this group right now.</p>
      )}
    </div>
  );
}

function ResolveReadinessPanel({
  error,
  loading,
  onRefresh,
  onResolveAll,
  plan,
  resolving,
  result,
}) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  const executable = actions.filter((action) => action?.can_execute === true);
  const confirmationRequired = actions.filter((action) => action?.requires_confirmation === true);
  const backendNeeded = actions.filter((action) => action?.status === 'backend_action_needed');
  const otherActions = actions.filter((action) => (
    action?.can_execute !== true
    && action?.requires_confirmation !== true
    && action?.status !== 'backend_action_needed'
  ));
  const hasPlan = Boolean(plan || result);
  const executed = Array.isArray(result?.executed_actions) ? result.executed_actions : [];
  const skipped = Array.isArray(result?.skipped_actions) ? result.skipped_actions : [];
  const canRun = executable.length > 0 && !resolving;
  const hasPlanContent = actions.length > 0 || executed.length > 0 || skipped.length > 0 || Boolean(error) || loading || resolving;

  if ((!hasPlan && !loading && !error) || (!hasPlanContent && !result)) {
    return null;
  }

  return (
    <section className="mb-5 rounded-lg border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/60 dark:bg-[#101820]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <ListChecks className="text-amber-700 dark:text-amber-300" size={18} aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">Safe readiness fixes</h2>
            {loading ? <StatusBadge status="running" label="Checking plan" /> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
            Start safe fixes only starts work that is available now, such as text/search processing or selected-source cleanup. It does not remove original source files or make confirmation choices for you.
          </p>
          {plan?.display_message || plan?.message ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{plan.display_message || plan.message}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || resolving}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh plan
          </button>
          <button
            type="button"
            onClick={onResolveAll}
            disabled={!canRun}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            title={!executable.length ? 'No safe automatic fixes are available right now.' : undefined}
          >
            <Play size={15} aria-hidden="true" />
            {resolving ? 'Starting' : 'Start safe fixes'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorPanel title="Resolve plan unavailable" error={error} onRetry={onRefresh} />
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
          <div className="font-semibold">{result.display_message || result.message || 'Safe fixes started.'}</div>
          <p className="mt-1 text-xs leading-5">
            Original source files were preserved. Destructive actions were not included.
          </p>
          {executed.length || skipped.length ? (
            <p className="mt-1 text-xs leading-5">
              {executed.length ? `${executed.length} safe action(s) started. ` : ''}
              {skipped.length ? `${skipped.length} action(s) still need review or backend support.` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <ResolveActionGroup
          title="Safe to start"
          detail="These can start without deleting files or choosing for you."
          actions={executable}
          tone="safe"
        />
        <ResolveActionGroup
          title="Needs your choice"
          detail="These may involve excluding files or confirming what belongs. Review samples first."
          actions={confirmationRequired}
          tone="warn"
        />
        <ResolveActionGroup
          title="Operator/runtime required"
          detail="These are known blockers that need operator support or graph-processing runtime before they can clear."
          actions={[...backendNeeded, ...otherActions]}
          tone="info"
        />
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { canContribute, canSeeAdmin, canSeeOperations } = useOperatorMode();
  const [state, setState] = useState({
    loading: true,
    error: null,
    summary: null,
    connectors: [],
    health: null,
    sourceAlignment: null,
    resolvePlan: null,
    resolvePlanError: null,
    resolvePlanLoading: false,
    resolveResult: null,
    resolving: false,
    resolveActionError: null,
  });

  const loadResolvePlan = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setState((current) => ({ ...current, resolvePlanLoading: true, resolvePlanError: null }));
    }
    try {
      const token = await getAccessToken();
      if (!canSeeOperations) {
        setState((current) => ({
          ...current,
          resolvePlan: null,
          resolvePlanError: null,
          resolvePlanLoading: false,
        }));
        return;
      }
      const result = await evidenceApi.getReadinessResolvePlan(caseId, { token });
      recordFingerprint(result, 'Readiness resolve plan');
      setState((current) => ({
        ...current,
        resolvePlan: result.data,
        resolvePlanError: null,
        resolvePlanLoading: false,
      }));
    } catch (error) {
      const unavailable = resolvePlanUnavailable(error);
      setState((current) => ({
        ...current,
        resolvePlan: unavailable ? null : current.resolvePlan,
        resolvePlanError: unavailable ? null : error,
        resolvePlanLoading: false,
      }));
    }
  }, [canSeeOperations, caseId, getAccessToken, recordFingerprint]);

  const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }
    const token = await getAccessToken();
    const requests = [
      { key: 'summary', label: 'Case summary', promise: evidenceApi.getCaseSummary(caseId, { token }) },
    ];
    if (canContribute) {
      requests.push({ key: 'connectors', label: 'Source connectors', promise: evidenceApi.getSourceConnectors(caseId, { token }) });
    }
    if (canSeeOperations) {
      requests.push({ key: 'resolvePlan', label: 'Readiness resolve plan', promise: evidenceApi.getReadinessResolvePlan(caseId, { token }) });
    }
    if (canSeeOperations) {
      requests.push({ key: 'health', label: 'Case health', promise: evidenceApi.getCaseHealth(caseId, { token }) });
      requests.push({ key: 'sourceAlignment', label: 'Source alignment', promise: evidenceApi.getSourceAlignmentLatest(caseId, { token }) });
    }
    const results = await Promise.allSettled(requests.map((request) => request.promise));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        recordFingerprint(result.value, requests[index].label);
      }
    });
    const fulfilledByKey = Object.fromEntries(
      requests.map((request, index) => [request.key, fulfilledValue(results[index])?.data || null]),
    );

    setState({
      loading: false,
      error: results.find((result, index) => result.status === 'rejected' && requests[index]?.key !== 'resolvePlan')?.reason || null,
      summary: fulfilledByKey.summary || null,
      connectors: fulfilledByKey.connectors?.providers || [],
      health: fulfilledByKey.health || null,
      sourceAlignment: fulfilledByKey.sourceAlignment || null,
      resolvePlan: fulfilledByKey.resolvePlan || null,
      resolvePlanError: results.find((result, index) => (
        requests[index]?.key === 'resolvePlan'
        && result.status === 'rejected'
        && !resolvePlanUnavailable(result.reason)
      ))?.reason || null,
      resolvePlanLoading: false,
      resolveResult: null,
      resolving: false,
      resolveActionError: null,
    });
  }, [canContribute, canSeeOperations, caseId, getAccessToken, recordFingerprint]);

  const resolveAllReadiness = useCallback(async () => {
    setState((current) => ({ ...current, resolving: true, resolveActionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.resolveAllReadiness(
        caseId,
        {
          run_source_alignment_when_safe: true,
        },
        { token },
      );
      recordFingerprint(result, 'Resolve all readiness');
      setState((current) => ({
        ...current,
        resolving: false,
        resolveResult: result.data,
        resolvePlan: result.data?.remaining_plan || current.resolvePlan,
        resolveActionError: null,
      }));
      await loadResolvePlan({ quiet: true });
      void loadDashboard({ quiet: true });
    } catch (error) {
      setState((current) => ({ ...current, resolving: false, resolveActionError: error }));
    }
  }, [caseId, getAccessToken, loadDashboard, loadResolvePlan, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDashboard]);

  const counts = useMemo(() => (
    canSeeOperations && state.health?.summary?.counts
      ? state.health.summary.counts
      : state.summary?.counts || state.health?.summary?.counts || {}
  ), [canSeeOperations, state.health, state.summary]);
  const google = useMemo(
    () => state.connectors.find((provider) => provider.provider === 'google_drive') || null,
    [state.connectors],
  );
  const activeGoogleConnection = useMemo(() => (
    google?.connections?.find((connection) => connection.status === 'active' && (connection.can_browse || connection.owned_by_current_user)) || null
  ), [google]);
  const activeGoogleEmail = activeGoogleConnection?.account_email
    || activeGoogleConnection?.email
    || activeGoogleConnection?.display_name
    || t('Connected account');
  const googleSyncTime = latestConnectorTime(activeGoogleConnection);

  const documentFiles = counts.document_files || counts.document_extractions || 0;
  const indexedRecords = sumCounts(counts, ['communication_messages', 'canonical_people', 'person_aliases', 'entity_mentions']);
  const missingS3Files = counts.extracted_files_missing_s3 || 0;
  const copiedFilesPendingProcessing = counts.s3_files_not_extracted || 0;
  const documentsNeedingReview = sumCounts(counts, [
    'documents_needing_review',
    'needs_review_documents',
    'uncategorized_documents',
    'missing_source_documents',
    'missing_date_documents',
    'missing_text_documents',
    'sensitive_info_warning_documents',
  ]);
  const documentsNeedingAttention = documentsNeedingReview + missingS3Files + copiedFilesPendingProcessing;
  const peopleNeedingReview = sumCounts(counts, [
    'people_contacts_needing_review',
    'contact_links_needing_review',
    'unmatched_contact_links',
    'low_confidence_contact_links',
    'duplicate_people',
    'relationship_links_needing_review',
    'needs_review_entities',
    'entity_review_items',
  ]);
  const pendingInvitations = sumCounts(counts, ['pending_invitations', 'open_invitations', 'invitations_pending']);
  const graph = state.health?.graph || {};
  const vectorCoverage = graph.chunk_embedding_coverage || {};
  const parentGaps = graph.child_parent_link_gaps || {};
  const missingChildEmbeddings = vectorCoverage.missing_child_embeddings || 0;
  const missingParentEdges = parentGaps.missing_parent_edges || 0;
  const systemReady = documentFiles > 0
    && copiedFilesPendingProcessing === 0
    && (!canSeeOperations || (missingS3Files === 0 && (!graph.configured || (graph.ok && missingChildEmbeddings === 0 && missingParentEdges === 0))));
  const systemWorking = documentFiles > 0 || indexedRecords > 0 || copiedFilesPendingProcessing > 0;
  const searchReadinessActionLabel = copiedFilesPendingProcessing > 0
    ? t('See processing status')
    : canSeeOperations
      ? t('Open operations metrics')
      : t('Open documents');
  const searchReadinessActionTo = copiedFilesPendingProcessing > 0
    ? `/evidence/cases/${caseId}/jobs#processing-status`
    : canSeeOperations
      ? `/evidence/cases/${caseId}/health`
      : `/evidence/cases/${caseId}/documents`;
  const shouldLivePollReadiness = copiedFilesPendingProcessing > 0;

  useEffect(() => {
    if (!shouldLivePollReadiness) {
      return undefined;
    }
    const timerId = window.setInterval(() => {
      void loadDashboard({ quiet: true });
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [loadDashboard, shouldLivePollReadiness]);

  const readiness = [
    {
      title: t('Google Drive'),
      viewerVisible: false,
      status: state.loading ? 'working' : activeGoogleConnection ? 'ready' : google?.configured ? 'attention' : 'attention',
      label: state.loading ? t('Checking') : activeGoogleConnection ? t('Connected') : t('Needs connection'),
      detail: state.loading
        ? t('Checking source connection.')
        : activeGoogleConnection
          ? t('Connected as {account}{time}', {
            account: activeGoogleEmail,
            time: googleSyncTime ? ` | ${formatDateTime(googleSyncTime)}` : '',
          })
          : t('Connect Google Drive to bring case files into Evidence.'),
      actionLabel: activeGoogleConnection ? t('Manage source') : t('Connect Google Drive'),
      to: `/evidence/cases/${caseId}/intake`,
    },
    {
      title: t('Google Contacts'),
      viewerVisible: false,
      status: state.loading ? 'working' : activeGoogleConnection?.can_sync_contacts ? 'ready' : activeGoogleConnection ? 'attention' : 'attention',
      label: state.loading ? t('Checking') : activeGoogleConnection?.can_sync_contacts ? t('Ready') : t('Needs permission'),
      detail: state.loading
        ? t('Checking contact permission.')
        : activeGoogleConnection?.can_sync_contacts
          ? t('Contacts can be synced from the connected Google account.')
          : activeGoogleConnection
            ? t('Reconnect Google with contact permission to sync contacts.')
            : t('Connect Google before syncing contacts.'),
      actionLabel: activeGoogleConnection?.can_sync_contacts ? t('Sync Contacts') : t('Review contacts setup'),
      to: `/evidence/cases/${caseId}/intake`,
    },
    {
      title: t('Search & Q&A readiness'),
      status: state.loading ? 'working' : systemReady ? 'ready' : systemWorking ? 'working' : 'attention',
      label: state.loading ? t('Checking') : systemReady ? t('Ready') : systemWorking ? t('Processing') : t('Waiting'),
      detail: state.loading
        ? t('Checking whether files are ready to search.')
        : systemReady
          ? t('Files are ready to search and review.')
          : copiedFilesPendingProcessing > 0
            ? (
              <PendingProcessingText
                count={copiedFilesPendingProcessing}
                suffix={t('document row(s) still need text/search processing before full Ask Documents coverage.')}
              />
            )
          : systemWorking
            ? t('Documents are still being prepared for search and Q&A.')
            : t('Add or connect source files to prepare them for search.'),
      actionLabel: searchReadinessActionLabel,
      to: searchReadinessActionTo,
    },
  ];
  const attentionItems = useMemo(() => filterAttentionItems(buildCaseAttentionItems({
    caseId,
    counts,
    health: state.health,
    sourceAlignment: state.sourceAlignment,
    connectors: state.connectors,
  }), 'case-home'), [caseId, counts, state.connectors, state.health, state.sourceAlignment]);
  const attentionCards = [
    documentsNeedingAttention > 0
      ? {
        icon: FileText,
        title: t('Documents needing attention'),
        detail: copiedFilesPendingProcessing > 0
          ? (
            <PendingProcessingText
              count={copiedFilesPendingProcessing}
              suffix={t('document row(s) still need text/search processing before they are fully available in Ask Documents.')}
            />
          )
          : t('Uncategorized documents, missing source/date/text, or sensitive-info warnings should be reviewed before sharing or export.'),
        to: `/evidence/cases/${caseId}/documents`,
        count: documentsNeedingAttention,
        countLabel: t('items'),
      }
      : null,
    canContribute && peopleNeedingReview > 0
      ? {
        icon: UsersRound,
        title: t('People & contacts needing review'),
        detail: t('Phone numbers and emails may be linked from contacts, messages, or manual review. Confirm uncertain matches before using them in summaries or exports.'),
        to: `/evidence/cases/${caseId}/entities`,
        count: peopleNeedingReview,
        countLabel: t('items'),
      }
      : null,
    canSeeAdmin && pendingInvitations > 0
      ? {
        icon: ShieldAlert,
        title: t('Access & sharing'),
        detail: t('Only authorized people should have workspace access. Review pending invitations and sharing before exports.'),
        to: `/evidence/cases/${caseId}/access`,
        count: pendingInvitations,
        countLabel: t('pending'),
      }
      : null,
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        title="Case Home"
        description="Review document readiness, source sync, people/contact review, and pending invitations."
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDashboard} /></div> : null}
      {state.resolveActionError ? (
        <div className="mb-5">
          <ErrorPanel title="Safe fixes failed" error={state.resolveActionError} />
        </div>
      ) : null}

      {canSeeOperations ? (
        <ResolveReadinessPanel
          error={state.resolvePlanError}
          loading={state.resolvePlanLoading}
          onRefresh={() => loadResolvePlan()}
          onResolveAll={resolveAllReadiness}
          plan={state.resolvePlan}
          resolving={state.resolving}
          result={state.resolveResult}
        />
      ) : null}

      {attentionItems.length ? (
        <NeedsAttentionPanel
          items={attentionItems}
          description="Items that may block full propagation, sync, search, access, or review."
        />
      ) : null}

      <section className="mb-5">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Case readiness')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('Source connections and search readiness for this case.')}</p>
          </div>
          {canSeeOperations ? (
            <Link
              to={`/evidence/cases/${caseId}/health`}
              className="text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
            >
              {t('Open operations metrics')}
            </Link>
          ) : null}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {readiness
            .filter((item) => canContribute || item.viewerVisible !== false)
            .map((item) => (
            <ReadinessCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      {attentionCards.length ? (
        <section className="mb-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Needs attention')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('Important items for document readiness, contact links, and safe workspace access.')}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {attentionCards.map((card) => (
              <ReviewCard key={card.title} {...card} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Start Here')}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              {t('Choose the next task for this case.')}
            </p>
          </div>
          <Link
            to={`/evidence/cases/${caseId}/documents`}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
          >
            {t('Open documents')}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <QuickActionCard
            icon={MessageSquare}
            title={t('Ask Documents')}
            detail={t('Ask a question and open cited documents from the answer.')}
            to={`/evidence/cases/${caseId}/query`}
            tone="primary"
          />
          <QuickActionCard
            icon={FileText}
            title={t('Review documents')}
            detail={t('Search, filter, preview, and open case files.')}
            to={`/evidence/cases/${caseId}/documents`}
          />
          {canContribute ? (
            <QuickActionCard
              icon={UploadCloud}
              title={t('Add documents')}
              detail={t('Upload files or connect sources such as Google Drive.')}
              to={`/evidence/cases/${caseId}/intake`}
              tone="good"
            />
          ) : null}
          <QuickActionCard
            icon={LifeBuoy}
            title={t('Get help')}
            detail={t('Ask Axiom or send the support team an idea or issue.')}
            to={`/evidence/cases/${caseId}/support`}
          />
        </div>
      </section>

      {canSeeOperations ? (
        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-700 dark:border-gray-800 dark:bg-[#0b1117] dark:text-gray-200">
                <Cloud size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Operations metrics')}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t('Detailed jobs, database, storage, graph, vector, and source alignment checks live in Health.')}
                </p>
              </div>
            </div>
            <Link
              to={`/evidence/cases/${caseId}/health`}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
            >
              {t('Open operations metrics')}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
