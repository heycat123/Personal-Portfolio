import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Cloud,
  FileText,
  LifeBuoy,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, sumCounts } from '../utils/formatters';

function fulfilledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
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
      iconClass: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-900/60',
      background: 'bg-emerald-50 dark:bg-emerald-950/20',
      badge: 'configured',
    };
  }
  if (status === 'working') {
    return {
      icon: Activity,
      iconClass: 'text-sky-700 dark:text-sky-300',
      border: 'border-sky-200 dark:border-sky-900/60',
      background: 'bg-sky-50 dark:bg-sky-950/20',
      badge: 'running',
    };
  }
  return {
    icon: CircleAlert,
    iconClass: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-900/60',
    background: 'bg-amber-50 dark:bg-amber-950/20',
    badge: 'pending',
  };
}

function ReadinessCard({ title, status, label, detail, actionLabel, to }) {
  const tone = statusTone(status);
  const Icon = tone.icon;
  return (
    <section className={`rounded-lg border p-4 shadow-sm ${tone.border} ${tone.background}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-md border border-black/10 bg-white/70 p-2 dark:border-white/10 dark:bg-white/10">
            <Icon className={tone.iconClass} size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-gray-700 dark:text-gray-300">{detail}</p>
          </div>
        </div>
        <StatusBadge status={tone.badge} label={label} />
      </div>
      {to && actionLabel ? (
        <Link
          to={to}
          className="mt-4 inline-flex items-center rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15"
        >
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

function QuickActionCard({ icon, title, detail, to, tone = 'default' }) {
  const toneClasses = {
    default: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-[#101820] dark:hover:border-gray-700',
    primary: 'border-sky-200 bg-sky-50 hover:border-sky-300 dark:border-sky-900/60 dark:bg-sky-950/20 dark:hover:border-sky-800',
    good: 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:hover:border-emerald-800',
  };
  return (
    <Link
      to={to}
      className={`block rounded-lg border p-4 shadow-sm transition-colors ${toneClasses[tone] || toneClasses.default}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md border border-black/10 bg-white/70 p-2 text-gray-700 dark:border-white/10 dark:bg-white/10 dark:text-gray-100">
          {createElement(icon, { size: 18, 'aria-hidden': true })}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-950 dark:text-white">{title}</div>
          <div className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-400">{detail}</div>
        </div>
      </div>
    </Link>
  );
}

function ReviewCard({ icon, title, detail, to, count, countLabel }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-sky-300 dark:border-gray-800 dark:bg-[#101820] dark:hover:border-sky-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-md border border-black/10 bg-gray-50 p-2 text-gray-700 dark:border-white/10 dark:bg-white/10 dark:text-gray-100">
            {createElement(icon, { size: 18, 'aria-hidden': true })}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-400">{detail}</p>
          </div>
        </div>
        {Number.isFinite(count) ? (
          <div className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            {count} {countLabel}
          </div>
        ) : null}
      </div>
    </Link>
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
  });

  const loadDashboard = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const token = await getAccessToken();
    const requests = [
      { key: 'summary', label: 'Case summary', promise: evidenceApi.getCaseSummary(caseId, { token }) },
      { key: 'connectors', label: 'Source connectors', promise: evidenceApi.getSourceConnectors(caseId, { token }) },
    ];
    if (canSeeOperations) {
      requests.push({ key: 'health', label: 'Case health', promise: evidenceApi.getCaseHealth(caseId, { token }) });
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
      error: results.find((result) => result.status === 'rejected')?.reason || null,
      summary: fulfilledByKey.summary || null,
      connectors: fulfilledByKey.connectors?.providers || [],
      health: fulfilledByKey.health || null,
    });
  }, [canSeeOperations, caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDashboard]);

  const counts = state.summary?.counts || state.health?.summary?.counts || {};
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
  ]) || missingS3Files;
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
    && (!canSeeOperations || (missingS3Files === 0 && (!graph.configured || (graph.ok && missingChildEmbeddings === 0 && missingParentEdges === 0))));
  const systemWorking = documentFiles > 0 || indexedRecords > 0;

  const readiness = [
    {
      title: t('Google Drive'),
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
            ? t('{count} copied file(s) still need text/search processing before full Ask Documents coverage.', { count: copiedFilesPendingProcessing })
          : systemWorking
            ? t('Documents are still being prepared for search and Q&A.')
            : t('Add or connect source files to prepare them for search.'),
      actionLabel: canSeeOperations ? t('Open operations metrics') : t('Open documents'),
      to: canSeeOperations ? `/evidence/cases/${caseId}/health` : `/evidence/cases/${caseId}/documents`,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Case Home"
        description="Review document readiness, source sync, people/contact review, and pending invitations."
        actions={
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t('Refresh')}
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadDashboard} /></div> : null}

      {copiedFilesPendingProcessing > 0 ? (
        <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <div>
                <h2 className="font-semibold">{t('Search readiness is not complete')}</h2>
                <p className="mt-1">
                  {t('{count} copied file(s) still need text/search processing before they are fully available in Ask Documents.', { count: copiedFilesPendingProcessing })}
                </p>
              </div>
            </div>
            <Link
              to={`/evidence/cases/${caseId}/documents`}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-950/40"
            >
              {t('Open Documents')}
            </Link>
          </div>
        </section>
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
          {readiness.map((item) => (
            <ReadinessCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="mb-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Review work')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('Important review items for document organization, contact links, and safe workspace access.')}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ReviewCard
            icon={FileText}
            title={t('Documents needing review')}
            detail={t('Uncategorized documents, missing source/date/text, or sensitive-info warnings should be reviewed before sharing or export.')}
            to={`/evidence/cases/${caseId}/documents`}
            count={documentsNeedingReview}
            countLabel={t('items')}
          />
          {canContribute ? (
            <ReviewCard
              icon={UsersRound}
              title={t('People & contacts needing review')}
              detail={t('Phone numbers and emails may be linked from contacts, messages, or manual review. Confirm uncertain matches before using them in summaries or exports.')}
              to={`/evidence/cases/${caseId}/entities`}
              count={peopleNeedingReview}
              countLabel={t('items')}
            />
          ) : null}
          {canSeeAdmin ? (
            <ReviewCard
              icon={ShieldAlert}
              title={t('Access & sharing')}
              detail={t('Only authorized people should have workspace access. Review pending invitations and sharing before exports.')}
              to={`/evidence/cases/${caseId}/admin`}
              count={pendingInvitations}
              countLabel={t('pending')}
            />
          ) : null}
        </div>
      </section>

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
          <QuickActionCard
            icon={UploadCloud}
            title={t('Add documents')}
            detail={t('Upload files or connect sources such as Google Drive.')}
            to={`/evidence/cases/${caseId}/intake`}
            tone="good"
          />
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
                  {t('Detailed jobs, database, storage, graph, vector, and source proof checks live in Health.')}
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
