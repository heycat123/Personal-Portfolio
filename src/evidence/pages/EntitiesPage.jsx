import { Check, GitMerge, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { humanizeKey, truncateMiddle } from '../utils/formatters';

const PAGE_SIZE = 50;

function confidenceLabel(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 'n/a';
  }
  return number.toFixed(2);
}

function latestAliasDecision(confirmations, alias) {
  const normalized = alias?.normalized_alias;
  if (!normalized) {
    return null;
  }
  return confirmations.find((item) => item.normalized_alias === normalized) || null;
}

export default function EntitiesPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [queryDraft, setQueryDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [customAlias, setCustomAlias] = useState('');
  const [mergeNote, setMergeNote] = useState('');
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

  const loadEntities = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getEntities(caseId, { limit: PAGE_SIZE, offset, q: appliedQuery }, { token });
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
  }, [appliedQuery, caseId, getAccessToken, offset, recordFingerprint, selectedPersonId]);

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

  const loadEntityDetail = useCallback(async (personId) => {
    if (!personId) {
      return;
    }
    setState((current) => ({ ...current, detailLoading: true, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getEntity(caseId, personId, { token });
      recordFingerprint(result, 'Entity detail');
      setState((current) => ({
        ...current,
        detailLoading: false,
        entity: result.data?.entity || null,
        detailFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, detailLoading: false, actionError: error }));
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
  };

  const clearSearch = () => {
    setQueryDraft('');
    setAppliedQuery('');
    setOffset(0);
    setSelectedPersonId(null);
  };

  const reviewAlias = useCallback(async (alias, decision) => {
    const entity = state.entity;
    if (!entity) {
      return;
    }
    const actionId = `${alias.normalized_alias || alias.alias}_${decision}`;
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
          reviewer_note: decision === 'confirm' ? 'Confirmed from entity review UI.' : 'Rejected from entity review UI.',
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
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, getAccessToken, loadEntityDetail, recordFingerprint, state.entity]);

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
          reviewer_note: 'Manually added confirmed alias.',
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
    } catch (error) {
      setState((current) => ({ ...current, actionId: null, actionError: error }));
    }
  }, [caseId, customAlias, getAccessToken, loadEntityDetail, recordFingerprint, state.entity]);

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
  const confirmedAliases = useMemo(
    () => confirmations.filter((item) => item.decision === 'confirm'),
    [confirmations],
  );
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE_SIZE));
  const canGoPrevious = offset > 0;
  const canGoNext = offset + PAGE_SIZE < state.total;

  return (
    <div>
      <PageHeader
        title="Entities"
        description={`${state.total} canonical entity records${appliedQuery ? ` matching "${appliedQuery}"` : ''}. Confirmed aliases become review evidence for query-time resolution.`}
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

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex max-w-2xl flex-1 flex-col gap-2 sm:flex-row">
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
          {appliedQuery ? (
            <button type="button" onClick={clearSearch} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10">
              Clear
            </button>
          ) : null}
        </form>
        <div className="flex flex-wrap gap-2">
          {state.fingerprint?.id ? <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} label="List fingerprint" /> : null}
          {state.actionFingerprint?.id ? <RequestFingerprint fingerprintId={state.actionFingerprint.id} correlationId={state.actionFingerprint.correlationId} label="Action fingerprint" /> : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div>
          <DataTable
            rows={state.entities}
            rowKey={(item) => item.person_id}
            emptyTitle={state.loading ? 'Loading entities' : 'No entities matched'}
            columns={[
              {
                key: 'canonical_name',
                header: 'Entity',
                render: (item) => (
                  <button
                    type="button"
                    onClick={() => setSelectedPersonId(item.person_id)}
                    className={`text-left font-semibold ${selectedPersonId === item.person_id ? 'text-sky-700 dark:text-sky-300' : 'text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300'}`}
                  >
                    {item.canonical_name || item.person_id}
                    <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">{truncateMiddle(item.person_id, 28)}</span>
                  </button>
                ),
              },
              { key: 'confidence', header: 'Confidence', render: (item) => confidenceLabel(item.confidence) },
              { key: 'aliases', header: 'Aliases', render: (item) => item.alias_count || 0 },
              { key: 'mentions', header: 'Mentions', render: (item) => item.mention_count || 0 },
              { key: 'roles', header: 'Roles', render: (item) => item.role_count || 0 },
              { key: 'confirmed', header: 'Confirmed', render: (item) => item.confirmed_alias_count || 0 },
            ]}
          />

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                disabled={!canGoPrevious || state.loading}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                disabled={!canGoNext || state.loading}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
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
              <input
                value={mergeNote}
                onChange={(event) => setMergeNote(event.target.value)}
                placeholder="Optional note for merge/reject decisions"
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
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
                        <button
                          type="button"
                          onClick={() => decideMergeSuggestion(suggestion, 'merge')}
                          disabled={state.actionId === `${actionBase}_merge`}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                        >
                          <GitMerge size={13} aria-hidden="true" />
                          Merge first pair
                        </button>
                        <button
                          type="button"
                          onClick={() => decideMergeSuggestion(suggestion, 'reject')}
                          disabled={state.actionId === `${actionBase}_reject`}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
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
            {state.detailFingerprint?.id ? (
              <div className="mt-3">
                <RequestFingerprint fingerprintId={state.detailFingerprint.id} correlationId={state.detailFingerprint.correlationId} compact />
              </div>
            ) : null}
            {entity ? (
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Confidence</div>
                  <div className="text-gray-950 dark:text-white">{confidenceLabel(entity.confidence)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Source Rows</div>
                  <div className="text-gray-950 dark:text-white">{entity.source_rows || 0}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Confirmed</div>
                  <div className="text-gray-950 dark:text-white">{confirmedAliases.length}</div>
                </div>
              </div>
            ) : null}
          </section>

          {entity ? (
            <>
              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Add Confirmed Alias</h3>
                <div className="mt-3 flex gap-2">
                  <input
                    value={customAlias}
                    onChange={(event) => setCustomAlias(event.target.value)}
                    placeholder="Example: Kayla Willson"
                    className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={addConfirmedAlias}
                    disabled={!customAlias.trim() || state.actionId === 'custom_alias'}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    <Check size={15} aria-hidden="true" />
                    Add
                  </button>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Aliases</h3>
                <div className="mt-3 space-y-2">
                  {(entity.aliases || []).slice(0, 30).map((alias) => {
                    const decision = latestAliasDecision(confirmations, alias);
                    return (
                      <div key={alias.normalized_alias || alias.alias} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-gray-950 dark:text-white">{alias.alias}</span>
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{alias.occurrence_count || 0} occurrence(s)</span>
                          </div>
                          {decision ? <StatusBadge status={decision.decision === 'confirm' ? 'succeeded' : decision.decision === 'reject' ? 'failed' : 'degraded'} label={humanizeKey(decision.decision)} /> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>{alias.normalized_alias}</span>
                          <span>confidence {confidenceLabel(alias.confidence)}</span>
                          {alias.first_source_page ? <span>p. {alias.first_source_page}</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => reviewAlias(alias, 'confirm')}
                            disabled={state.actionId === `${alias.normalized_alias || alias.alias}_confirm`}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            <Check size={13} aria-hidden="true" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewAlias(alias, 'reject')}
                            disabled={state.actionId === `${alias.normalized_alias || alias.alias}_reject`}
                            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            <X size={13} aria-hidden="true" />
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Roles And Mentions</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(entity.roles || []).slice(0, 12).map((role) => (
                    <span key={role.role_name} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      {role.role_name}: {role.occurrence_count}
                    </span>
                  ))}
                </div>
                <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm text-gray-700 dark:text-gray-300">
                  {(entity.mentions || []).slice(0, 20).map((mention) => (
                    <li key={mention.mention_id} className="rounded-md bg-gray-50 p-2 dark:bg-black/20">
                      {mention.mention_text}
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {mention.mention_type} | p. {mention.page_number || 'n/a'} | {truncateMiddle(mention.file_hash, 18)}
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
