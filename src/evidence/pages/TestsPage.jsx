import { CheckCircle2, ClipboardCheck, Play, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime, humanizeKey } from '../utils/formatters';

function latestRunSummary(run) {
  if (!run) {
    return 'No baseline run has been queued from the web UI yet.';
  }
  const caseCount = run.case_count ?? run.selected_case_ids?.length ?? 0;
  return `${caseCount} case(s), ${run.status}, ${formatDateTime(run.created_at)}`;
}

function ReviewBadge({ review }) {
  if (!review) {
    return <StatusBadge status="pending" label="Needs review" />;
  }
  const status = review.decision === 'pass' ? 'succeeded' : review.decision === 'fail' ? 'failed' : 'degraded';
  return <StatusBadge status={status} label={humanizeKey(review.decision)} />;
}

export default function TestsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [state, setState] = useState({
    loading: true,
    error: null,
    actionError: null,
    cases: [],
    runs: [],
    reviewSummary: {},
    selectedCaseIds: new Set(),
    reviewForms: {},
    queueing: false,
    savingCaseId: null,
    runPaid: false,
    agenticLlmGrader: false,
    fingerprint: null,
    actionFingerprint: null,
  });

  const loadTests = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getBaselineTests(caseId, { token });
      recordFingerprint(result, 'Baseline tests');
      const cases = result.data?.cases || [];
      setState((current) => {
        const nextForms = { ...current.reviewForms };
        cases.forEach((item) => {
          if (!nextForms[item.id]) {
            nextForms[item.id] = {
              decision: item.latest_review?.decision || 'pass',
              system_answer: item.latest_review?.system_answer || '',
              reviewer_note: item.latest_review?.reviewer_note || '',
            };
          }
        });
        return {
          ...current,
          loading: false,
          error: null,
          cases,
          runs: result.data?.runs || [],
          reviewSummary: result.data?.review_summary || {},
          reviewForms: nextForms,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        };
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadTests();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadTests]);

  const latestRun = state.runs[0] || null;
  const selectedCount = state.selectedCaseIds.size;
  const reviewedCount = useMemo(
    () => state.cases.filter((item) => item.latest_review).length,
    [state.cases],
  );

  const toggleCase = useCallback((testCaseId) => {
    setState((current) => {
      const selectedCaseIds = new Set(current.selectedCaseIds);
      if (selectedCaseIds.has(testCaseId)) {
        selectedCaseIds.delete(testCaseId);
      } else {
        selectedCaseIds.add(testCaseId);
      }
      return { ...current, selectedCaseIds };
    });
  }, []);

  const updateReviewForm = useCallback((testCaseId, patch) => {
    setState((current) => ({
      ...current,
      reviewForms: {
        ...current.reviewForms,
        [testCaseId]: {
          ...(current.reviewForms[testCaseId] || { decision: 'pass', system_answer: '', reviewer_note: '' }),
          ...patch,
        },
      },
    }));
  }, []);

  const queueRun = useCallback(async (caseIds) => {
    setState((current) => ({ ...current, queueing: true, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.queueBaselineTestRun(
        caseId,
        {
          case_ids: caseIds,
          run_paid: state.runPaid,
          agentic_llm_grader: state.agenticLlmGrader,
        },
        { token },
      );
      recordFingerprint(result, 'Queue baseline test run');
      setState((current) => ({
        ...current,
        queueing: false,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadTests();
    } catch (error) {
      setState((current) => ({ ...current, queueing: false, actionError: error }));
    }
  }, [caseId, getAccessToken, loadTests, recordFingerprint, state.agenticLlmGrader, state.runPaid]);

  const saveReview = useCallback(async (testCase) => {
    const form = state.reviewForms[testCase.id] || {};
    setState((current) => ({ ...current, savingCaseId: testCase.id, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createBaselineTestReview(
        caseId,
        {
          test_case_id: testCase.id,
          decision: form.decision || 'pass',
          system_answer: form.system_answer || '',
          confirmed_answer: testCase.expected_answer || '',
          reviewer_note: form.reviewer_note || '',
          verified_facts_json: [],
          failures_json: form.decision === 'fail' && form.reviewer_note ? [form.reviewer_note] : [],
          cost_json: {},
        },
        { token },
      );
      recordFingerprint(result, 'Save baseline review');
      setState((current) => ({
        ...current,
        savingCaseId: null,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadTests();
    } catch (error) {
      setState((current) => ({ ...current, savingCaseId: null, actionError: error }));
    }
  }, [caseId, getAccessToken, loadTests, recordFingerprint, state.reviewForms]);

  return (
    <div>
      <PageHeader
        title="Tests"
        description={`${state.cases.length} baseline case(s), ${reviewedCount} reviewed. ${latestRunSummary(latestRun)}`}
        actions={
          <>
            <button
              type="button"
              onClick={loadTests}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => queueRun([])}
              disabled={state.queueing || !state.cases.length}
              className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              {state.queueing ? 'Queueing' : 'Queue baseline'}
            </button>
            <button
              type="button"
              onClick={() => queueRun([...state.selectedCaseIds])}
              disabled={state.queueing || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={16} aria-hidden="true" />
              Queue selected ({selectedCount})
            </button>
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadTests} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Test action failed" error={state.actionError} /></div> : null}

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status="configured" label="Baseline suite" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Reviews stored here are human audit records. The cloud worker currently queues the request; paid execution remains a controlled runtime task.
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {state.fingerprint?.id ? (
              <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} label="List fingerprint" />
            ) : null}
            {state.actionFingerprint?.id ? (
              <RequestFingerprint fingerprintId={state.actionFingerprint.id} correlationId={state.actionFingerprint.correlationId} label="Action fingerprint" />
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <h3 className="text-base font-semibold text-gray-950 dark:text-white">Run Options</h3>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={state.runPaid}
              onChange={(event) => setState((current) => ({ ...current, runPaid: event.target.checked }))}
              className="mt-1"
            />
            Mark the request as a paid baseline run.
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={state.agenticLlmGrader}
              onChange={(event) => setState((current) => ({ ...current, agenticLlmGrader: event.target.checked }))}
              className="mt-1"
            />
            Request LLM answer-equivalence grading.
          </label>
          {latestRun ? (
            <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm dark:bg-black/20">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900 dark:text-gray-100">Latest run</span>
                <StatusBadge status={latestRun.status} />
              </div>
              <div className="mt-2 text-gray-600 dark:text-gray-400">
                Estimated: ${Number(latestRun.estimated_cost_json?.estimated_paid_quality_usd || 0).toFixed(4)}
              </div>
              {latestRun.source_job_id ? (
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${latestRun.source_job_id}`}
                  className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
                >
                  Open job
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-4">
        {state.cases.map((testCase) => {
          const form = state.reviewForms[testCase.id] || { decision: 'pass', system_answer: '', reviewer_note: '' };
          const latestReview = testCase.latest_review;
          const isSelected = state.selectedCaseIds.has(testCase.id);
          return (
            <section key={testCase.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCase(testCase.id)}
                      aria-label={`Select ${testCase.id}`}
                    />
                    <StatusBadge status={testCase.priority === 'high' ? 'degraded' : 'unknown'} label={testCase.priority || 'priority'} />
                    <StatusBadge status="configured" label={humanizeKey(testCase.category || 'case')} />
                    <ReviewBadge review={latestReview} />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-gray-950 dark:text-white">{testCase.question}</h3>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{testCase.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => queueRun([testCase.id])}
                  disabled={state.queueing}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                >
                  <Play size={16} aria-hidden="true" />
                  Queue this case
                </button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Confirmed answer</div>
                    <div className="mt-1 rounded-md bg-gray-50 p-3 text-sm text-gray-800 dark:bg-black/20 dark:text-gray-200">
                      {testCase.expected_answer || 'No confirmed answer stored; validate using required text and citations.'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Required text</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(testCase.must_contain || []).map((item) => (
                        <span key={item} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {item}
                        </span>
                      ))}
                      {!(testCase.must_contain || []).length ? <span className="text-sm text-gray-500">None</span> : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Required sources</div>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                      {(testCase.must_include_sources || []).map((source) => (
                        <li key={source} className="flex gap-2">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span>{source}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">System answer for review</span>
                    <textarea
                      value={form.system_answer}
                      onChange={(event) => updateReviewForm(testCase.id, { system_answer: event.target.value })}
                      rows={7}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                      placeholder="Paste the system answer here when reviewing a run."
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Decision</span>
                      <select
                        value={form.decision}
                        onChange={(event) => updateReviewForm(testCase.id, { decision: event.target.value })}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                      >
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                        <option value="needs_work">Needs work</option>
                        <option value="skip">Skip</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Review note</span>
                      <input
                        value={form.reviewer_note}
                        onChange={(event) => updateReviewForm(testCase.id, { reviewer_note: event.target.value })}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                        placeholder="Why it passed or failed"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => saveReview(testCase)}
                      disabled={state.savingCaseId === testCase.id}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save size={16} aria-hidden="true" />
                      {state.savingCaseId === testCase.id ? 'Saving' : 'Save review'}
                    </button>
                    {latestReview ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <ClipboardCheck size={16} aria-hidden="true" />
                        Last reviewed {formatDateTime(latestReview.created_at)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
