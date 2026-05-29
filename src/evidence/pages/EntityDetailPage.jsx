import { ArrowLeft, Check, HelpCircle, Pencil, Plus } from 'lucide-react';
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
import { humanizeKey, truncateMiddle } from '../utils/formatters';

const COMMON_RELATIONSHIPS = [
  'maternal grandmother',
  'paternal grandmother',
  'grandmother',
  'maternal grandfather',
  'paternal grandfather',
  'grandfather',
  'grandparent',
  'mother',
  'father',
  'parent',
  'son',
  'daughter',
  'child',
  'grandchild',
  'brother',
  'babysitter',
  'half brother',
  'half sister',
  'sister',
  'aunt',
  'uncle',
  'niece',
  'nephew',
  'spouse',
  'partner',
  'therapist',
  'attorney',
  'teacher',
  'doctor',
  'lease tenant',
  'witness',
];

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

function reviewBadgeStatus(status) {
  if (status === 'confirmed') return 'succeeded';
  if (status === 'needs_review') return 'degraded';
  if (status === 'suppressed') return 'failed';
  return 'configured';
}

function promotionBadgeStatus(status) {
  if (status === 'confirmed' || status === 'promoted') return 'succeeded';
  if (status === 'suppressed') return 'failed';
  if (status === 'topic_only') return 'degraded';
  return 'configured';
}

function isInferredRelationship(relationship) {
  const sourceJson = relationship?.source_json || {};
  return sourceJson.inferred === true || sourceJson.source === 'relationship_inference';
}

function relationshipDisplay(label, t) {
  return t(String(label || '').trim());
}

function contactPointLabel(link) {
  return link.contact_point_value || link.phone_canonical || link.phone_value || link.email_address || link.contact_point_key || 'Unknown';
}

function normalizeIdentityText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b([a-z0-9]+)'s\b/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function latestConfirmedAlternateAliases(entity) {
  const canonical = normalizeIdentityText(entity?.normalized_name || entity?.canonical_name);
  const seen = new Set();
  return (entity?.alias_confirmations || [])
    .filter((item) => {
      const normalized = normalizeIdentityText(item.normalized_alias || item.alias);
      if (!normalized || normalized === canonical || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return item.decision === 'confirm';
    });
}

function confirmedRoles(entity) {
  return (entity?.roles || []).filter((role) => Number(role.confirmed_count || 0) > 0);
}

function contactPointGroups(entity) {
  const groups = { phone: [], email: [], address: [] };
  (entity?.contact_links || []).forEach((link) => {
    if (link.phone_canonical || link.phone_value || link.phone_digits || String(link.contact_point_value || '').match(/^\+?\d/)) {
      groups.phone.push({ kind: 'synced', key: link.contact_entity_link_id, value: contactPointLabel(link), link });
    }
    if (link.email_address || String(link.contact_point_value || '').includes('@')) {
      groups.email.push({ kind: 'synced', key: `${link.contact_entity_link_id}:email`, value: link.email_address || contactPointLabel(link), link });
    }
  });
  (entity?.manual_contact_points || []).forEach((point) => {
    if (groups[point.contact_type]) {
      groups[point.contact_type].push({ kind: 'manual', key: point.contact_point_id, value: point.contact_value, point });
    }
  });
  return groups;
}

function relationshipTargetChoices(entity, entities, searchedEntities) {
  const map = new Map();
  [...(searchedEntities || []), ...(entities || [])]
    .filter((item) => item?.person_id && item.person_id !== entity?.person_id)
    .forEach((item) => map.set(item.person_id, item));
  return [...map.values()].sort((a, b) => String(a.canonical_name || '').localeCompare(String(b.canonical_name || '')));
}

function entityMatchesQuery(entity, query) {
  const normalized = normalizeIdentityText(query);
  if (!normalized) {
    return true;
  }
  const aliases = [
    ...(entity?.aliases || []).map((alias) => alias?.alias || alias),
    ...(entity?.alias_confirmations || []).map((alias) => alias?.alias),
  ];
  return [
    entity?.canonical_name,
    entity?.person_id,
    entity?.normalized_name,
    ...aliases,
  ].some((value) => normalizeIdentityText(value).includes(normalized));
}

function relationshipTargetMatches(entity, entities, searchedEntities, query) {
  const search = normalizeIdentityText(query);
  if (!search) {
    return relationshipTargetChoices(entity, entities, searchedEntities).slice(0, 8);
  }
  const map = new Map();
  (searchedEntities || [])
    .filter((item) => item?.person_id && item.person_id !== entity?.person_id)
    .forEach((item) => map.set(item.person_id, item));
  (entities || [])
    .filter((item) => item?.person_id && item.person_id !== entity?.person_id && entityMatchesQuery(item, search))
    .forEach((item) => {
      if (!map.has(item.person_id)) {
        map.set(item.person_id, item);
      }
    });
  return [...map.values()].slice(0, 8);
}

function selectedRelationshipTarget(personId, entities, searchedEntities) {
  return [...(searchedEntities || []), ...(entities || [])].find((item) => item?.person_id === personId) || null;
}

function EntityTargetTypeahead({
  label,
  placeholder,
  value,
  search,
  options,
  baseEntities,
  currentEntity,
  loading,
  onSearchChange,
  onSelect,
  t,
}) {
  const selected = selectedRelationshipTarget(value, baseEntities, options);
  const matches = relationshipTargetMatches(currentEntity, baseEntities, options, search);
  const showMatches = Boolean(String(search || '').trim()) && !value;
  return (
    <div className="min-w-0">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-normal text-sky-900 dark:text-sky-100">{label}</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-950 dark:border-sky-900 dark:bg-[#0b1117] dark:text-gray-100"
        />
      </label>
      {selected ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          <span className="min-w-0 break-words">{t('Selected')}: <strong>{selected.canonical_name || selected.person_id}</strong></span>
          <button type="button" onClick={() => onSelect('', '')} className="shrink-0 rounded-md border border-emerald-300 px-2 py-1 text-xs font-semibold hover:bg-emerald-100 dark:border-emerald-800 dark:hover:bg-emerald-900/50">
            {t('Clear')}
          </button>
        </div>
      ) : null}
      {showMatches ? (
        <div className="mt-2 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{t('Searching...')}</div>
          ) : matches.length ? (
            matches.map((item) => (
              <button type="button" key={item.person_id} onClick={() => onSelect(item.person_id, item.canonical_name || item.person_id)} className="flex w-full flex-col items-start gap-0.5 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/40">
                <span className="font-semibold text-gray-950 dark:text-white">{item.canonical_name || item.person_id}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {item.alias_count ? t('{count} aliases', { count: item.alias_count }) : t('No aliases listed')}
                  {item.mention_count ? ` · ${t('{count} mentions', { count: item.mention_count })}` : ''}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{t('No matching entities found.')}</div>
          )}
        </div>
      ) : null}
    </div>
  );
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
    actionId: null,
    actionError: null,
    actionFingerprint: null,
  });
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [canonicalNameDraft, setCanonicalNameDraft] = useState('');
  const [aliasAddOpen, setAliasAddOpen] = useState(false);
  const [customAlias, setCustomAlias] = useState('');
  const [relationshipAddOpen, setRelationshipAddOpen] = useState(false);
  const [relationshipForm, setRelationshipForm] = useState({ relationship_label: '', target_person_id: '', target_search: '' });
  const [relationshipTargetOptions, setRelationshipTargetOptions] = useState([]);
  const [relationshipTargetLoading, setRelationshipTargetLoading] = useState(false);
  const [contactAddOpen, setContactAddOpen] = useState(false);
  const [contactPointForm, setContactPointForm] = useState({ contact_type: 'phone', contact_value: '', label: '' });
  const [entityOptions, setEntityOptions] = useState([]);

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
        actionId: null,
        actionError: null,
        actionFingerprint: null,
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

  useEffect(() => {
    setCanonicalNameDraft(entity?.canonical_name || '');
  }, [entity?.canonical_name]);

  const searchRelationshipTargets = useCallback(async (query) => {
    const search = String(query || '').trim();
    if (!search) {
      setRelationshipTargetOptions([]);
      return;
    }
    setRelationshipTargetLoading(true);
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getEntities(caseId, { limit: 25, offset: 0, q: search, sort_by: 'entity', sort_dir: 'asc' }, { token });
      recordFingerprint(result, 'Search relationship targets');
      setRelationshipTargetOptions(result.data?.entities || []);
    } catch (error) {
      setState((current) => ({ ...current, actionError: error }));
    } finally {
      setRelationshipTargetLoading(false);
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(async () => {
      try {
        const token = await getAccessToken();
        const result = await evidenceApi.getEntities(caseId, { limit: 100, offset: 0, sort_by: 'entity', sort_dir: 'asc' }, { token });
        setEntityOptions(result.data?.entities || []);
      } catch {
        setEntityOptions([]);
      }
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [caseId, getAccessToken]);

  useEffect(() => {
    const search = String(relationshipForm.target_search || '').trim();
    if (!search) {
      setRelationshipTargetOptions([]);
      return undefined;
    }
    const timerId = window.setTimeout(() => searchRelationshipTargets(search), 250);
    return () => window.clearTimeout(timerId);
  }, [relationshipForm.target_search, searchRelationshipTargets]);

  const refreshAfterAction = useCallback(async (result) => {
    setState((current) => ({
      ...current,
      actionId: null,
      actionFingerprint: {
        id: result.requestFingerprintId,
        correlationId: result.correlationId,
      },
    }));
    await loadEntity();
  }, [loadEntity]);

  const updateCanonicalName = useCallback(async () => {
    if (!entity || !canonicalNameDraft.trim() || canonicalNameDraft.trim() === entity.canonical_name) return;
    setState((current) => ({ ...current, actionId: 'canonical_name', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.updateEntity(caseId, entity.person_id, {
        canonical_name: canonicalNameDraft.trim(),
        reviewer_note: `Corrected canonical entity name from "${entity.canonical_name}" to "${canonicalNameDraft.trim()}".`,
      }, { token });
      recordFingerprint(result, 'Update entity canonical name');
      setNameEditOpen(false);
      await refreshAfterAction(result);
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [canonicalNameDraft, caseId, entity, getAccessToken, recordFingerprint, refreshAfterAction]);

  const addConfirmedAlias = useCallback(async () => {
    if (!entity || !customAlias.trim()) return;
    setState((current) => ({ ...current, actionId: 'custom_alias', actionError: null }));
    try {
      const token = await getAccessToken();
      const alias = customAlias.trim();
      const result = await evidenceApi.reviewEntityAlias(caseId, entity.person_id, {
        alias,
        normalized_alias: alias.toLowerCase().replace(/\s+/g, ' '),
        decision: 'confirm',
        reviewer_note: `Manually confirmed that "${alias}" resolves to ${entity.canonical_name}.`,
        confidence: 1,
        source_json: { source: 'entity_detail_page' },
      }, { token });
      recordFingerprint(result, 'Add confirmed entity alias');
      setCustomAlias('');
      setAliasAddOpen(false);
      await refreshAfterAction(result);
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, customAlias, entity, getAccessToken, recordFingerprint, refreshAfterAction]);

  const addRelationship = useCallback(async () => {
    if (!entity || !relationshipForm.relationship_label.trim() || !relationshipForm.target_person_id) return;
    setState((current) => ({ ...current, actionId: 'relationship', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createEntityRelationship(caseId, entity.person_id, {
        relationship_label: relationshipForm.relationship_label.trim(),
        target_person_id: relationshipForm.target_person_id,
        reviewer_note: `Confirmed relationship from entity detail page.`,
        confidence: 0.99,
      }, { token });
      recordFingerprint(result, 'Add entity relationship');
      setRelationshipForm({ relationship_label: '', target_person_id: '', target_search: '' });
      setRelationshipAddOpen(false);
      await refreshAfterAction(result);
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, entity, getAccessToken, recordFingerprint, refreshAfterAction, relationshipForm.relationship_label, relationshipForm.target_person_id]);

  const addContactPoint = useCallback(async () => {
    if (!entity || !contactPointForm.contact_value.trim()) return;
    setState((current) => ({ ...current, actionId: 'contact_point', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createEntityContactPoint(caseId, entity.person_id, {
        contact_type: contactPointForm.contact_type,
        contact_value: contactPointForm.contact_value.trim(),
        label: contactPointForm.label.trim() || null,
        reviewer_note: `Manually added contact point from entity detail page.`,
        confidence: 0.99,
      }, { token });
      recordFingerprint(result, 'Add entity contact point');
      setContactPointForm({ contact_type: 'phone', contact_value: '', label: '' });
      setContactAddOpen(false);
      await refreshAfterAction(result);
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, contactPointForm.contact_type, contactPointForm.contact_value, contactPointForm.label, entity, getAccessToken, recordFingerprint, refreshAfterAction]);

  const renderConfirmedAliases = () => {
    const aliases = latestConfirmedAlternateAliases(entity);
    if (!aliases.length) {
      return <p className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">{t('No confirmed alternate aliases yet.')}</p>;
    }
    return aliases.map((alias) => (
      <div key={alias.confirmation_id || alias.alias} className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/70 dark:bg-emerald-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="break-words font-semibold text-emerald-950 dark:text-emerald-100">{alias.alias}</span>
          <StatusBadge status="succeeded" label={t('Confirmed')} />
        </div>
        <div className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">{t('Resolves to {name}', { name: entity.canonical_name })}</div>
      </div>
    ));
  };

  const renderConfirmedRelationships = () => {
    const roleRows = confirmedRoles(entity).map((role) => ({
      key: `role:${role.role_name}`,
      label: role.role_name,
      detail: t('{count} confirmed assertion(s)', { count: role.confirmed_count || 0 }),
      badgeLabel: t('Confirmed'),
      badgeStatus: 'succeeded',
    }));
    const relationshipRows = (entity?.relationships || []).map((relationship) => {
      const inferred = isInferredRelationship(relationship);
      return {
        key: relationship.relationship_id,
        label: relationship.source_person_id === entity.person_id
          ? t('{source} is {relationship} of {target}', {
            source: relationship.source_canonical_name || entity.canonical_name,
            relationship: relationshipDisplay(relationship.relationship_label, t),
            target: relationship.target_canonical_name || relationship.target_person_id,
          })
          : t('{source} is {relationship} of {target}', {
            source: relationship.source_canonical_name || relationship.source_person_id,
            relationship: relationshipDisplay(relationship.relationship_label, t),
            target: relationship.target_canonical_name || entity.canonical_name,
          }),
        detail: inferred
          ? t('System-inferred from confirmed relationship(s); review if important.')
          : (relationship.reviewer_display_name || relationship.reviewer_email
            ? t('reviewed by {name}', { name: relationship.reviewer_display_name || relationship.reviewer_email })
            : t('User-confirmed relationship')),
        badgeLabel: inferred ? t('Inferred') : t('Confirmed'),
        badgeStatus: inferred ? 'configured' : 'succeeded',
      };
    });
    const rows = [...relationshipRows, ...roleRows];
    if (!rows.length) {
      return <p className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">{t('No confirmed relationships yet.')}</p>;
    }
    return rows.map((row) => (
      <div key={row.key} className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/70 dark:bg-emerald-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="break-words font-semibold text-emerald-950 dark:text-emerald-100">{row.label}</span>
          <StatusBadge status={row.badgeStatus} label={row.badgeLabel} />
        </div>
        <div className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">{row.detail}</div>
      </div>
    ));
  };

  const renderContactGroup = (title, items) => (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <div className="text-sm font-semibold text-gray-950 dark:text-white">{t(title)}</div>
      <div className="mt-2 space-y-2">
        {items.length ? items.map((item) => (
          <div key={item.key} className="rounded-md bg-gray-50 p-2 text-sm dark:bg-black/20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="break-words font-semibold text-gray-950 dark:text-white">{item.value}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {item.kind === 'manual' ? (item.point?.label || t('Manually added')) : (item.link?.contact_display_name || t('Synced contact'))}
                </div>
              </div>
              <StatusBadge status={item.kind === 'manual' ? 'succeeded' : contactLinkBadgeStatus(item.link.link_status)} label={item.kind === 'manual' ? t('Confirmed') : humanizeKey(item.link.link_status)} />
            </div>
          </div>
        )) : <p className="text-sm text-gray-600 dark:text-gray-400">{t('None listed.')}</p>}
      </div>
    </div>
  );

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
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Entity action failed" error={state.actionError} /></div> : null}
      {state.fingerprint?.id ? <div className="mb-4"><RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} /></div> : null}
      {state.actionFingerprint?.id ? <div className="mb-4"><RequestFingerprint fingerprintId={state.actionFingerprint.id} correlationId={state.actionFingerprint.correlationId} label="Action fingerprint" /></div> : null}

      {entity ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="break-words text-lg font-semibold text-gray-950 dark:text-white">{entity.canonical_name}</h3>
                    <button type="button" onClick={() => setNameEditOpen((current) => !current)} title={t('Edit entity name')} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-sky-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-sky-300">
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{truncateMiddle(entity.person_id, 42)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <StatusBadge status="configured" label={humanizeKey(entity.effective_entity_type || entity.entity_type || 'entity')} />
                  <StatusBadge status={reviewBadgeStatus(entity.review_status)} label={humanizeKey(entity.review_status || 'candidate')} />
                  <StatusBadge status={promotionBadgeStatus(entity.promotion_state)} label={humanizeKey(entity.promotion_state || 'candidate')} />
                </div>
              </div>
              {nameEditOpen ? (
                <div className="mt-3 flex gap-2">
                  <input value={canonicalNameDraft} onChange={(event) => setCanonicalNameDraft(event.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100" />
                  <button type="button" onClick={updateCanonicalName} disabled={!canonicalNameDraft.trim() || canonicalNameDraft.trim() === entity.canonical_name || state.actionId === 'canonical_name'} className="inline-flex items-center gap-1 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                    <Check size={15} aria-hidden="true" />
                    {t('Save')}
                  </button>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Confirmed Aliases')}</h3>
                <button type="button" onClick={() => setAliasAddOpen((current) => !current)} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">
                  <Plus size={14} aria-hidden="true" />
                  {t('Add')}
                </button>
              </div>
              {aliasAddOpen ? (
                <div className="mt-3 flex gap-2">
                  <input value={customAlias} onChange={(event) => setCustomAlias(event.target.value)} placeholder={t('Example: GMA Maureen')} className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100" />
                  <button type="button" onClick={addConfirmedAlias} disabled={!customAlias.trim() || state.actionId === 'custom_alias'} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                    <Check size={15} aria-hidden="true" />
                    {t('Save')}
                  </button>
                </div>
              ) : null}
              <div className="mt-3 space-y-2">{renderConfirmedAliases()}</div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Confirmed Relationships')}</h3>
                <button type="button" onClick={() => setRelationshipAddOpen((current) => !current)} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">
                  <Plus size={14} aria-hidden="true" />
                  {t('Add')}
                </button>
              </div>
              <div className="mt-3 space-y-2">{renderConfirmedRelationships()}</div>
              {relationshipAddOpen ? (
                <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/70 dark:bg-sky-950/30">
                  <div className="grid gap-2 lg:grid-cols-2">
                    <input list="entity-detail-relationship-suggestions" value={relationshipForm.relationship_label} onChange={(event) => setRelationshipForm((current) => ({ ...current, relationship_label: event.target.value }))} placeholder={t('Example: maternal grandmother')} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-950 dark:border-sky-900 dark:bg-[#0b1117] dark:text-gray-100" />
                    <EntityTargetTypeahead
                      label={t('Related entity')}
                      placeholder={t('Search target, e.g. Forest Lee')}
                      value={relationshipForm.target_person_id}
                      search={relationshipForm.target_search}
                      options={relationshipTargetOptions}
                      baseEntities={entityOptions}
                      currentEntity={entity}
                      loading={relationshipTargetLoading}
                      onSearchChange={(nextSearch) => setRelationshipForm((current) => ({ ...current, target_search: nextSearch, target_person_id: '' }))}
                      onSelect={(targetPersonId, label) => setRelationshipForm((current) => ({ ...current, target_person_id: targetPersonId, target_search: label }))}
                      t={t}
                    />
                    <datalist id="entity-detail-relationship-suggestions">{COMMON_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship} label={relationshipDisplay(relationship, t)} />)}</datalist>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={addRelationship} disabled={!relationshipForm.relationship_label.trim() || !relationshipForm.target_person_id || state.actionId === 'relationship'} className="inline-flex items-center justify-center gap-1 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                      <Check size={15} aria-hidden="true" />
                      {t('Save')}
                    </button>
                  </div>
                </div>
              ) : null}
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
                  <dd className="mt-1"><StatusBadge status="configured" label={humanizeKey(entity.effective_entity_type || entity.entity_type || 'entity')} /></dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Review State')}</dt>
                  <dd className="mt-1"><StatusBadge status={reviewBadgeStatus(entity.review_status)} label={humanizeKey(entity.review_status || 'candidate')} /></dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Promotion')}</dt>
                  <dd className="mt-1"><StatusBadge status={promotionBadgeStatus(entity.promotion_state)} label={humanizeKey(entity.promotion_state || 'candidate')} /></dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Priority')}</dt>
                  <dd className="mt-1 text-gray-950 dark:text-white">{entity.review_priority ?? 0}</dd>
                </div>
              </dl>
              {entity.review_reason ? (
                <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
                  <div className="font-semibold">{t('Why this appears here')}</div>
                  <p className="mt-1">{entity.review_reason}</p>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Contact Points')}</h3>
                <button type="button" onClick={() => setContactAddOpen((current) => !current)} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">
                  <Plus size={14} aria-hidden="true" />
                  {t('Add')}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('Phone numbers and emails linked from contact sync and communication address matching.')}</p>
              {contactAddOpen ? (
                <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/70 dark:bg-sky-950/30">
                  <div className="grid gap-2">
                    <select value={contactPointForm.contact_type} onChange={(event) => setContactPointForm((current) => ({ ...current, contact_type: event.target.value }))} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-950 dark:border-sky-900 dark:bg-[#0b1117] dark:text-gray-100">
                      <option value="phone">{t('Phone')}</option>
                      <option value="email">{t('Email')}</option>
                      <option value="address">{t('Address')}</option>
                    </select>
                    <input value={contactPointForm.contact_value} onChange={(event) => setContactPointForm((current) => ({ ...current, contact_value: event.target.value }))} placeholder={t('Contact value')} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-950 dark:border-sky-900 dark:bg-[#0b1117] dark:text-gray-100" />
                    <input value={contactPointForm.label} onChange={(event) => setContactPointForm((current) => ({ ...current, label: event.target.value }))} placeholder={t('Optional label')} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-950 dark:border-sky-900 dark:bg-[#0b1117] dark:text-gray-100" />
                    <button type="button" onClick={addContactPoint} disabled={!contactPointForm.contact_value.trim() || state.actionId === 'contact_point'} className="inline-flex items-center justify-center gap-1 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                      <Check size={15} aria-hidden="true" />
                      {t('Save')}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 space-y-3">
                {(() => {
                  const groups = contactPointGroups(entity);
                  return (
                    <>
                      {renderContactGroup('Phone', groups.phone)}
                      {renderContactGroup('Email', groups.email)}
                      {renderContactGroup('Address', groups.address)}
                    </>
                  );
                })()}
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
