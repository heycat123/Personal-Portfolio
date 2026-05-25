import { Check, ChevronDown, ChevronRight, ExternalLink, GitMerge, HelpCircle, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { humanizeKey, truncateMiddle } from '../utils/formatters';

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
  ['source_rows', 'Source rows'],
  ['entity', 'Entity'],
  ['confidence', 'Confidence'],
  ['aliases', 'Aliases'],
  ['mentions', 'Mentions'],
  ['roles', 'Roles'],
  ['confirmed', 'Confirmed'],
];

function confidenceLabel(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 'n/a';
  }
  return number.toFixed(2);
}

function InfoTip({ label }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex rounded-full text-gray-400 hover:text-sky-700 dark:hover:text-sky-300"
    >
      <HelpCircle size={14} aria-hidden="true" />
    </button>
  );
}

function latestAliasDecision(confirmations, alias) {
  const normalized = alias?.normalized_alias;
  if (!normalized) {
    return null;
  }
  return confirmations.find((item) => item.normalized_alias === normalized) || null;
}

function decisionStatus(decision) {
  if (decision === 'confirm') return 'succeeded';
  if (decision === 'reject') return 'failed';
  return 'degraded';
}

export default function EntitiesPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [queryDraft, setQueryDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [rowDetails, setRowDetails] = useState({});
  const [customAlias, setCustomAlias] = useState('');
  const [mergeNote, setMergeNote] = useState('');
  const [sortBy, setSortBy] = useState('source_rows');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({
    minConfidence: '',
    minAliases: '',
    minMentions: '',
    minConfirmed: '',
  });
  const [reassignTargets, setReassignTargets] = useState({});
  const [state, setState] = useState({
    loading: true,
    detailLoading: false,
    suggestionsLoading: true,
    actionId: null,
    error: null,
    actionError: null,
    entities: [],
    total: 0,
    entity: null,
    suggestions: [],
    decisions: [],
    fingerprint: null,
    detailFingerprint: null,
    actionFingerprint: null,
  });

  const entityLookup = useMemo(() => {
    const map = new Map();
    state.entities.forEach((item) => map.set(item.person_id, item));
    return map;
  }, [state.entities]);

  const loadEntityDetail = useCallback(async (personId, options = {}) => {
    if (!personId) {
      return null;
    }
    if (!options.silent) {
      setState((current) => ({ ...current, detailLoading: true, actionError: null }));
    }
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getEntity(caseId, personId, { token });
      recordFingerprint(result, 'Entity detail');
      const entity = result.data?.entity || null;
      setState((current) => ({
        ...current,
        detailLoading: false,
        entity: options.forRow ? current.entity : entity,
        detailFingerprint: options.forRow
          ? current.detailFingerprint
          : {
              id: result.requestFingerprintId,
              correlationId: result.correlationId,
            },
      }));
      if (options.forRow && entity) {
        setRowDetails((current) => ({ ...current, [personId]: entity }));
      }
      return entity;
    } catch (error) {
      setState((current) => ({ ...current, detailLoading: false, actionError: error }));
      return null;
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const loadEntities = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const params = {
        limit: PAGE_SIZE,
        offset,
        q: appliedQuery,
        sort_by: sortBy,
        sort_dir: sortDir,
        min_confidence: filters.minConfidence,
        min_aliases: filters.minAliases,
        min_mentions: filters.minMentions,
        min_confirmed: filters.minConfirmed,
      };
      const result = await evidenceApi.getEntities(caseId, params, { token });
      recordFingerprint(result, 'Entities list');
      const entities = result.data?.entities || [];
      setState((current) => ({
        ...current,
        loading: false,
        entities,
        total: result.data?.total || 0,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      if (!selectedPersonId && entities[0]?.person_id) {
        setSelectedPersonId(entities[0].person_id);
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [appliedQuery, caseId, filters.minAliases, filters.minConfidence, filters.minConfirmed, filters.minMentions, getAccessToken, offset, recordFingerprint, selectedPersonId, sortBy, sortDir]);

  const loadSuggestions = useCallback(async () => {
    setState((current) => ({ ...current, suggestionsLoading: true }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getEntityMergeSuggestions(caseId, { limit: 30 }, { token });
      recordFingerprint(result, 'Entity merge suggestions');
      setState((current) => ({
        ...current,
        suggestionsLoading: false,
        suggestions: result.data?.suggestions || [],
        decisions: result.data?.decisions || [],
      }));
    } catch (error) {
      setState((current) => ({ ...current, suggestionsLoading: false, actionError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadEntities();
      loadSuggestions();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadEntities, loadSuggestions]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadEntityDetail(selectedPersonId);
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadEntityDetail, selectedPersonId]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setOffset(0);
    setAppliedQuery(queryDraft.trim());
    setSelectedPersonId(null);
    setExpandedRows(new Set());
  };

  const clearSearch = () => {
    setQueryDraft('');
    setAppliedQuery('');
    setOffset(0);
    setSelectedPersonId(null);
    setExpandedRows(new Set());
    setFilters({ minConfidence: '', minAliases: '', minMentions: '', minConfirmed: '' });
  };

  const toggleSort = (nextSortBy) => {
    if (sortBy === nextSortBy) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(nextSortBy);
      setSortDir(nextSortBy === 'entity' ? 'asc' : 'desc');
    }
    setOffset(0);
  };

  const toggleExpanded = async (personId) => {
    const next = new Set(expandedRows);
    if (next.has(personId)) {
      next.delete(personId);
      setExpandedRows(next);
      return;
    }
    next.add(personId);
    setExpandedRows(next);
    if (!rowDetails[personId]) {
      await loadEntityDetail(personId, { forRow: true, silent: true });
    }
  };

  const reviewAlias = useCallback(async (entity, alias, decision) => {
    if (!entity) {
      return;
    }
    const actionId = `${entity.person_id}_${alias.normalized_alias || alias.alias}_${decision}`;
    setState((current) => ({ ...current, actionId, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.reviewEntityAlias(
        caseId,
        entity.person_id,
        {
          alias_id: alias.alias_id || null,
          alias: alias.alias,
          normalized_alias: alias.normalized_alias || alias.alias.toLowerCase(),
          decision,
          reviewer_note: decision === 'confirm'
            ? `Confirmed that alias "${alias.alias}" resolves to ${entity.canonical_name}.`
            : `Rejected alias "${alias.alias}" for ${entity.canonical_name}.`,
          confidence: alias.confidence ?? null,
          source_json: {
            source: 'entities_page',
            occurrence_count: alias.occurrence_count,
            source_file_hashes: alias.source_file_hashes || [],
          },
        },
        { token },
      );
      recordFingerprint(result, 'Review entity alias');
      setState((current) => ({
        ...current,
        actionId: null,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadEntityDetail(entity.person_id);
      await loadEntityDetail(entity.person_id, { forRow: true, silent: true });
      await loadEntities();
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, getAccessToken, loadEntities, loadEntityDetail, recordFingerprint]);

  const reassignAlias = useCallback(async (entity, alias) => {
    const targetPersonId = reassignTargets[`${entity.person_id}:${alias.normalized_alias || alias.alias}`];
    if (!entity || !targetPersonId) {
      return;
    }
    const actionId = `${entity.person_id}_${alias.normalized_alias || alias.alias}_reassign`;
    setState((current) => ({ ...current, actionId, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.reassignEntityAlias(
        caseId,
        entity.person_id,
        {
          alias_id: alias.alias_id || null,
          alias: alias.alias,
          normalized_alias: alias.normalized_alias || alias.alias.toLowerCase(),
          target_person_id: targetPersonId,
          reviewer_note: `Corrected alias "${alias.alias}" from ${entity.canonical_name} to ${entityLookup.get(targetPersonId)?.canonical_name || targetPersonId}.`,
          confidence: alias.confidence ?? null,
          source_json: {
            source: 'entities_page_reassign',
            occurrence_count: alias.occurrence_count,
          },
        },
        { token },
      );
      recordFingerprint(result, 'Reassign entity alias');
      setState((current) => ({
        ...current,
        actionId: null,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadEntityDetail(entity.person_id);
      await loadEntityDetail(entity.person_id, { forRow: true, silent: true });
      await loadEntities();
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, entityLookup, getAccessToken, loadEntities, loadEntityDetail, reassignTargets, recordFingerprint]);

  const addConfirmedAlias = useCallback(async () => {
    const entity = state.entity;
    const alias = customAlias.trim();
    if (!entity || !alias) {
      return;
    }
    setState((current) => ({ ...current, actionId: 'custom_alias', actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.reviewEntityAlias(
        caseId,
        entity.person_id,
        {
          alias,
          normalized_alias: alias.toLowerCase().replace(/\s+/g, ' '),
          decision: 'confirm',
          reviewer_note: `Manually confirmed that "${alias}" resolves to ${entity.canonical_name}.`,
          confidence: 1,
          source_json: { source: 'manual_entity_review' },
        },
        { token },
      );
      recordFingerprint(result, 'Add confirmed entity alias');
      setCustomAlias('');
      setState((current) => ({
        ...current,
        actionId: null,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadEntityDetail(entity.person_id);
      await loadEntities();
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, customAlias, getAccessToken, loadEntities, loadEntityDetail, recordFingerprint, state.entity]);

  const decideMergeSuggestion = useCallback(async (suggestion, decision) => {
    const people = suggestion.people || [];
    if (people.length < 2) {
      return;
    }
    const actionId = `${suggestion.suggestion_type}_${suggestion.match_value}_${decision}`;
    setState((current) => ({ ...current, actionId, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createEntityMergeDecision(
        caseId,
        {
          source_person_id: people[0].person_id,
          target_person_id: people[1].person_id,
          decision,
          reviewer_note: mergeNote || `${humanizeKey(decision)} from merge suggestion review.`,
          suggestion_source: suggestion.suggestion_type,
          evidence_json: {
            match_value: suggestion.match_value,
            aliases: suggestion.aliases || [],
            people,
            confidence: suggestion.confidence,
          },
        },
        { token },
      );
      recordFingerprint(result, 'Entity merge decision');
      setMergeNote('');
      setState((current) => ({
        ...current,
        actionId: null,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadSuggestions();
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, getAccessToken, loadSuggestions, mergeNote, recordFingerprint]);

  const entity = state.entity;
  const confirmations = useMemo(() => entity?.alias_confirmations || [], [entity]);
  const confirmedAliases = useMemo(() => confirmations.filter((item) => item.decision === 'confirm'), [confirmations]);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE_SIZE));
  const canGoPrevious = offset > 0;
  const canGoNext = offset + PAGE_SIZE < state.total;

  const renderAliasRows = (detailEntity, compact = false) => {
    const detailConfirmations = detailEntity?.alias_confirmations || [];
    return (detailEntity?.aliases || []).slice(0, compact ? 12 : 40).map((alias) => {
      const decision = latestAliasDecision(detailConfirmations, alias);
      const targetKey = `${detailEntity.person_id}:${alias.normalized_alias || alias.alias}`;
      const actionBase = `${detailEntity.person_id}_${alias.normalized_alias || alias.alias}`;
      return (
        <div key={alias.normalized_alias || alias.alias} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-gray-950 dark:text-white">{alias.alias}</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                resolves to {detailEntity.canonical_name}; {alias.occurrence_count || 0} occurrence(s)
              </span>
            </div>
            {decision ? <StatusBadge status={decisionStatus(decision.decision)} label={humanizeKey(decision.decision)} /> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{alias.normalized_alias}</span>
            <span>extraction confidence {confidenceLabel(alias.confidence)}</span>
            {decision?.reviewer_display_name || decision?.reviewer_email ? (
              <span>reviewed by {decision.reviewer_display_name || decision.reviewer_email}</span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              title={`Confirm alias "${alias.alias}" should resolve to ${detailEntity.canonical_name}.`}
              onClick={() => reviewAlias(detailEntity, alias, 'confirm')}
              disabled={state.actionId === `${actionBase}_confirm`}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              <Check size={13} aria-hidden="true" />
              Confirm here
            </button>
            <button
              type="button"
              title={`Reject alias "${alias.alias}" for ${detailEntity.canonical_name}.`}
              onClick={() => reviewAlias(detailEntity, alias, 'reject')}
              disabled={state.actionId === `${actionBase}_reject`}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <X size={13} aria-hidden="true" />
              Reject here
            </button>
            <select
              value={reassignTargets[targetKey] || ''}
              onChange={(event) => setReassignTargets((current) => ({ ...current, [targetKey]: event.target.value }))}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              title="Choose the correct entity if this alias is attached to the wrong person."
            >
              <option value="">Correct target...</option>
              {state.entities.filter((item) => item.person_id !== detailEntity.person_id).map((item) => (
                <option key={item.person_id} value={item.person_id}>{item.canonical_name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => reassignAlias(detailEntity, alias)}
              disabled={!reassignTargets[targetKey] || state.actionId === `${actionBase}_reassign`}
              className="rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
              title="Reject this alias on the current entity and confirm it on the selected target entity."
            >
              Move alias
            </button>
          </div>
        </div>
      );
    });
  };

  return (
    <div>
      <PageHeader
        title="Entities"
        description={`${state.total} canonical entity records${appliedQuery ? ` matching "${appliedQuery}"` : ''}. Alias review means deciding which real person an extracted name should resolve to.`}
        actions={
          <button
            type="button"
            onClick={() => {
              loadEntities();
              loadSuggestions();
              if (selectedPersonId) {
                loadEntityDetail(selectedPersonId);
              }
            }}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadEntities} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Entity action failed" error={state.actionError} /></div> : null}

      <section className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
        <div className="grid gap-3 lg:grid-cols-3">
          <div><strong>Confirm here</strong> records that an alias, such as "grandma", should resolve to the selected entity.</div>
          <div><strong>Reject here</strong> records that the alias should not resolve to the selected entity.</div>
          <div><strong>Move alias</strong> rejects it on the current entity and confirms it on the chosen correct entity.</div>
        </div>
      </section>

      <div className="mb-4 flex flex-col gap-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 lg:flex-row">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} aria-hidden="true" />
            <span className="sr-only">Search entities</span>
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Search names, aliases, or person ids"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-sky-500 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:focus:border-sky-400"
            />
          </label>
          <button type="submit" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10">
            Search
          </button>
          <button type="button" onClick={clearSearch} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10">
            Clear
          </button>
        </form>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
              Sort <InfoTip label="Sort controls the main entity table order." />
            </span>
            <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setOffset(0); }} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100">
              {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Direction</span>
            <select value={sortDir} onChange={(event) => { setSortDir(event.target.value); setOffset(0); }} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <label className="block">
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
              Min Confidence <InfoTip label="Average extraction/entity-resolution confidence from ingestion. It is not legal certainty and it is not user confirmation." />
            </span>
            <input value={filters.minConfidence} onChange={(event) => { setFilters((current) => ({ ...current, minConfidence: event.target.value })); setOffset(0); }} inputMode="decimal" placeholder="0.75" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Min Aliases</span>
            <input value={filters.minAliases} onChange={(event) => { setFilters((current) => ({ ...current, minAliases: event.target.value })); setOffset(0); }} inputMode="numeric" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Min Mentions</span>
            <input value={filters.minMentions} onChange={(event) => { setFilters((current) => ({ ...current, minMentions: event.target.value })); setOffset(0); }} inputMode="numeric" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100" />
          </label>
          <label className="block">
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
              Min Confirmed <InfoTip label="Confirmed means a user reviewed an alias and recorded that it resolves to this entity." />
            </span>
            <input value={filters.minConfirmed} onChange={(event) => { setFilters((current) => ({ ...current, minConfirmed: event.target.value })); setOffset(0); }} inputMode="numeric" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {state.fingerprint?.id ? <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} label="List fingerprint" /> : null}
          {state.actionFingerprint?.id ? <RequestFingerprint fingerprintId={state.actionFingerprint.id} correlationId={state.actionFingerprint.correlationId} label="Action fingerprint" /> : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:bg-[#0c1218] dark:text-gray-400">
                <tr>
                  <th className="px-3 py-3">Aliases</th>
                  {[
                    ['entity', 'Entity', 'Canonical entity generated by ingestion. Click the name to open the full entity page.'],
                    ['confidence', 'Confidence', 'Average model/heuristic extraction confidence for this canonical entity.'],
                    ['aliases', 'Aliases', 'Number of distinct aliases currently attached to this entity by ingestion.'],
                    ['mentions', 'Mentions', 'Number of extracted mentions resolved to this entity.'],
                    ['roles', 'Roles', 'Number of role assertions attached to this entity.'],
                    ['confirmed', 'Confirmed', 'Number of human alias confirmations recorded for this entity.'],
                  ].map(([key, label, help]) => (
                    <th key={key} className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-sky-700 dark:hover:text-sky-300">
                        {label}
                        <InfoTip label={help} />
                        {sortBy === key ? <span>{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {state.entities.map((item) => {
                  const isExpanded = expandedRows.has(item.person_id);
                  const detail = rowDetails[item.person_id];
                  return (
                    <>
                      <tr key={item.person_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                        <td className="px-3 py-3 align-top">
                          <button type="button" onClick={() => toggleExpanded(item.person_id)} className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-white/10" title="Expand aliases">
                            {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2">
                            <button type="button" onClick={() => setSelectedPersonId(item.person_id)} className={`text-left font-semibold ${selectedPersonId === item.person_id ? 'text-sky-700 dark:text-sky-300' : 'text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300'}`}>
                              {item.canonical_name || item.person_id}
                              <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">{truncateMiddle(item.person_id, 28)}</span>
                            </button>
                            <Link to={`/evidence/cases/${caseId}/entities/${item.person_id}`} className="mt-0.5 text-gray-400 hover:text-sky-700 dark:hover:text-sky-300" title="Open entity page">
                              <ExternalLink size={14} aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">{confidenceLabel(item.confidence)}</td>
                        <td className="px-4 py-3 align-top">{item.alias_count || 0}</td>
                        <td className="px-4 py-3 align-top">{item.mention_count || 0}</td>
                        <td className="px-4 py-3 align-top">{item.role_count || 0}</td>
                        <td className="px-4 py-3 align-top">{item.confirmed_alias_count || 0}</td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${item.person_id}_aliases`}>
                          <td colSpan={7} className="bg-gray-50 px-4 py-3 dark:bg-black/20">
                            {detail ? (
                              <div>
                                <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                                  Aliases currently attached to {detail.canonical_name}
                                </div>
                                <div className="grid gap-2 lg:grid-cols-2">{renderAliasRows(detail, true)}</div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-600 dark:text-gray-400">Loading aliases...</div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
                {!state.entities.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {state.loading ? 'Loading entities' : 'No entities matched'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))} disabled={!canGoPrevious || state.loading} className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10">
                Previous
              </button>
              <button type="button" onClick={() => setOffset((current) => current + PAGE_SIZE)} disabled={!canGoNext || state.loading} className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10">
                Next
              </button>
            </div>
          </div>

          <section className="mt-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">Merge Suggestions</h3>
              <StatusBadge status={state.suggestionsLoading ? 'running' : 'configured'} label={`${state.suggestions.length} suggestion(s)`} />
            </div>
            <label className="mb-3 block">
              <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Decision note</span>
              <input value={mergeNote} onChange={(event) => setMergeNote(event.target.value)} placeholder="Optional note for merge/reject decisions" className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100" />
            </label>
            <div className="space-y-3">
              {state.suggestions.slice(0, 8).map((suggestion) => {
                const people = suggestion.people || [];
                const actionBase = `${suggestion.suggestion_type}_${suggestion.match_value}`;
                return (
                  <div key={actionBase} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status="degraded" label={humanizeKey(suggestion.suggestion_type)} />
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{suggestion.match_value}</span>
                      <span className="text-gray-500 dark:text-gray-400">confidence {confidenceLabel(suggestion.confidence)}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                      {people.map((person) => (
                        <li key={person.person_id}>{person.canonical_name} <span className="text-xs text-gray-500">({truncateMiddle(person.person_id, 18)})</span></li>
                      ))}
                    </ul>
                    {people.length >= 2 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => decideMergeSuggestion(suggestion, 'merge')} disabled={state.actionId === `${actionBase}_merge`} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                          <GitMerge size={13} aria-hidden="true" />
                          Merge first pair
                        </button>
                        <button type="button" onClick={() => decideMergeSuggestion(suggestion, 'reject')} disabled={state.actionId === `${actionBase}_reject`} className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40">
                          <X size={13} aria-hidden="true" />
                          Reject pair
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!state.suggestions.length ? <p className="text-sm text-gray-600 dark:text-gray-400">No duplicate suggestions returned.</p> : null}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{entity?.canonical_name || 'Select an entity'}</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entity ? truncateMiddle(entity.person_id, 36) : 'Choose a row to inspect aliases and provenance.'}</p>
              </div>
              {entity ? <StatusBadge status="configured" label={entity.entity_type || 'entity'} /> : null}
            </div>
            {state.detailFingerprint?.id ? <div className="mt-3"><RequestFingerprint fingerprintId={state.detailFingerprint.id} correlationId={state.detailFingerprint.correlationId} compact /></div> : null}
            {entity ? (
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Confidence <InfoTip label="Average extraction/entity-resolution confidence from ingestion." /></div>
                  <div className="text-gray-950 dark:text-white">{confidenceLabel(entity.confidence)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Source Rows</div>
                  <div className="text-gray-950 dark:text-white">{entity.source_rows || 0}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Confirmed <InfoTip label="Human alias confirmations for this entity. The confirmation record includes who confirmed it." /></div>
                  <div className="text-gray-950 dark:text-white">{confirmedAliases.length}</div>
                </div>
              </div>
            ) : null}
            {entity ? (
              <Link to={`/evidence/cases/${caseId}/entities/${entity.person_id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100">
                <ExternalLink size={15} aria-hidden="true" />
                Open full entity page
              </Link>
            ) : null}
          </section>

          {entity ? (
            <>
              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="flex items-center gap-1 text-base font-semibold text-gray-950 dark:text-white">
                  Add Confirmed Alias
                  <InfoTip label="Use this only when you know another name, typo, nickname, role, or spelling should resolve to this selected entity." />
                </h3>
                <div className="mt-3 flex gap-2">
                  <input value={customAlias} onChange={(event) => setCustomAlias(event.target.value)} placeholder="Example: Kayla Willson" className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100" />
                  <button type="button" onClick={addConfirmedAlias} disabled={!customAlias.trim() || state.actionId === 'custom_alias'} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                    <Check size={15} aria-hidden="true" />
                    Add
                  </button>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Aliases For {entity.canonical_name}</h3>
                <div className="mt-3 space-y-2">{renderAliasRows(entity)}</div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Documents Mentioning This Entity</h3>
                <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-sm text-gray-700 dark:text-gray-300">
                  {(entity.document_mentions || []).slice(0, 20).map((document) => (
                    <li key={document.file_hash} className="rounded-md bg-gray-50 p-2 dark:bg-black/20">
                      {document.file_id ? (
                        <Link to={`/evidence/cases/${caseId}/documents/${document.file_id}`} className="font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300">
                          {document.original_filename || document.file_hash}
                        </Link>
                      ) : (
                        <span className="font-semibold">{document.original_filename || document.file_hash}</span>
                      )}
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {document.mention_count} mention(s); pages {(document.pages || []).slice(0, 8).join(', ') || 'n/a'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
