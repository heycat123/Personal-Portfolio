import { ArrowLeft, HelpCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, humanizeKey, truncateMiddle } from '../utils/formatters';

function confidenceLabel(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 'n/a';
  }
  return number.toFixed(2);
}

function contactLinkBadgeStatus(status) {
  if (status === 'confirmed' || status === 'auto_confirmed') return 'succeeded';
  if (status === 'rejected') return 'failed';
  if (status === 'review_needed') return 'degraded';
  return 'configured';
}

function contactPointLabel(link) {
  return link.contact_point_value || link.phone_canonical || link.phone_value || link.email_address || link.contact_point_key || 'Unknown';
}

function InfoTip({ label }) {
  return (
    <button type="button" title={label} aria-label={label} className="inline-flex rounded-full text-gray-400 hover:text-sky-700 dark:hover:text-sky-300">
      <HelpCircle size={14} aria-hidden="true" />
    </button>
  );
}

export default function EntityDetailPage() {
  const { caseId, personId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    error: null,
    entity: null,
    fingerprint: null,
  });

  const loadEntity = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getEntity(caseId, personId, { token });
      recordFingerprint(result, 'Entity detail page');
      setState({
        loading: false,
        error: null,
        entity: result.data?.entity || null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, personId, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(loadEntity, 0);
    return () => window.clearTimeout(timerId);
  }, [loadEntity]);

  const entity = state.entity;

  return (
    <div>
      <PageHeader
        title={entity?.canonical_name || 'Entity'}
        description={entity ? t('Entity id: {id}', { id: entity.person_id }) : 'Loading entity detail.'}
        translateTitle={!entity?.canonical_name}
        actions={
          <Link to={`/evidence/cases/${caseId}/entities`} className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10">
            <ArrowLeft size={16} aria-hidden="true" />
            {t('Back to entities')}
          </Link>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadEntity} /></div> : null}
      {state.fingerprint?.id ? <div className="mb-4"><RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} /></div> : null}

      {entity ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Aliases')}</h3>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {(entity.aliases || []).map((alias) => (
                  <div key={alias.normalized_alias || alias.alias} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                    <div className="font-semibold text-gray-950 dark:text-white">{alias.alias}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {alias.normalized_alias}; {alias.occurrence_count || 0} {t('occurrence(s)')}; {t('confidence')} {confidenceLabel(alias.confidence)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Documents Mentioning This Entity')}</h3>
              <div className="mt-3 space-y-2">
                {(entity.document_mentions || []).map((document) => (
                  <div key={document.file_hash} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                    {document.file_id ? (
                      <Link to={`/evidence/cases/${caseId}/documents/${document.file_id}`} className="font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300">
                        {document.original_filename || document.file_hash}
                      </Link>
                    ) : (
                      <span className="font-semibold text-gray-950 dark:text-white">{document.original_filename || document.file_hash}</span>
                    )}
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {document.mention_count} {t('mention(s)')}; {t('Pages').toLowerCase()} {(document.pages || []).slice(0, 12).join(', ') || 'n/a'}; {t('Hash').toLowerCase()} {truncateMiddle(document.file_hash, 24)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Mention Samples')}</h3>
              <div className="mt-3 space-y-2">
                {(entity.mentions || []).map((mention) => (
                  <div key={mention.mention_id} className="rounded-md bg-gray-50 p-3 text-sm dark:bg-black/20">
                    {mention.mention_text}
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {mention.mention_type}; {t('Page')} {mention.page_number || 'n/a'}; {t('confidence')} {confidenceLabel(mention.confidence)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Resolution Summary')}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                    {t('Confidence')} <InfoTip label={t('Average extraction/entity-resolution confidence from ingestion. This is not legal certainty.')} />
                  </dt>
                  <dd className="mt-1 text-gray-950 dark:text-white">{confidenceLabel(entity.confidence)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Source Rows')}</dt>
                  <dd className="mt-1 text-gray-950 dark:text-white">{entity.source_rows || 0}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Type')}</dt>
                  <dd className="mt-1"><StatusBadge status="configured" label={entity.entity_type || 'entity'} /></dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Human Alias Decisions')}</h3>
              <div className="mt-3 space-y-2">
                {(entity.alias_confirmations || []).map((decision) => (
                  <div key={decision.confirmation_id} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-950 dark:text-white">{decision.alias}</span>
                      <StatusBadge status={decision.decision === 'confirm' ? 'succeeded' : decision.decision === 'reject' ? 'failed' : 'degraded'} label={humanizeKey(decision.decision)} />
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t('by {name} on {date}', { name: decision.reviewer_display_name || decision.reviewer_email || decision.reviewer_user_id || t('unknown'), date: formatDateTime(decision.created_at) })}
                    </div>
                    {decision.reviewer_note ? <div className="mt-2 text-gray-700 dark:text-gray-300">{decision.reviewer_note}</div> : null}
                  </div>
                ))}
                {!(entity.alias_confirmations || []).length ? <p className="text-sm text-gray-600 dark:text-gray-400">{t('No human alias decisions recorded yet.')}</p> : null}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Contact Points')}</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('Phone numbers and emails linked from contact sync and communication address matching.')}</p>
              <div className="mt-3 space-y-2">
                {(entity.contact_links || []).map((link) => (
                  <div key={link.contact_entity_link_id} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-all font-semibold text-gray-950 dark:text-white">{contactPointLabel(link)}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{link.contact_display_name || t('Unnamed contact')}</div>
                      </div>
                      <StatusBadge status={contactLinkBadgeStatus(link.link_status)} label={humanizeKey(link.link_status)} />
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('confidence')} {confidenceLabel(link.confidence)}; {t('{count} communication address match(es)', { count: link.matched_address_count || 0 })}
                    </div>
                  </div>
                ))}
                {!(entity.contact_links || []).length ? <p className="text-sm text-gray-600 dark:text-gray-400">{t('No contact points are linked yet.')}</p> : null}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Roles')}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(entity.roles || []).map((role) => (
                  <span key={role.role_name} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    {role.role_name}: {role.occurrence_count}
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : !state.loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
          {t('Entity not found.')}
        </div>
      ) : null}
    </div>
  );
}
