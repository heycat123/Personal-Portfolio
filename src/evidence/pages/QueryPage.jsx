import { AlertTriangle, CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';

const DEFAULT_QUESTION = "what is Tiffany's Brazilian CPF number?";

function Panel({ title, children }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

export default function QueryPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [state, setState] = useState({
    running: false,
    error: null,
    result: null,
    fingerprint: null,
  });

  const runQuery = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setState((current) => ({ ...current, error: new Error('Enter a question before running a query.') }));
      return;
    }

    setState((current) => ({ ...current, running: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.queryCase(
        caseId,
        {
          question: trimmed,
          mode: 'agentic',
          include_trace: true,
        },
        { token },
      );
      recordFingerprint(result, 'Case query');
      setState({
        running: false,
        error: null,
        result: result.data,
        fingerprint: {
          id: result.requestFingerprintId || result.data?.request_fingerprint_id,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setState((current) => ({ ...current, running: false, error }));
    }
  }, [caseId, getAccessToken, question, recordFingerprint]);

  const verifier = state.result?.verifier_status;
  const isVerified = Boolean(verifier?.verified || verifier?.sufficient);
  const isUnavailable = state.result?.status === 'unavailable';

  return (
    <div>
      <PageHeader
        title="Query"
        description="Ask case-scoped evidence questions and inspect answer sufficiency, verified facts, citations, trace, and cost."
        actions={
          <StatusBadge
            status={isVerified ? 'succeeded' : state.result ? 'degraded' : 'pending'}
            label={isVerified ? 'Verified' : state.result ? 'Not verified' : 'Ready'}
          />
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Query failed" error={state.error} /></div> : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
        <label className="block">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Question</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runQuery}
            disabled={state.running}
            className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={16} aria-hidden="true" />
            {state.running ? 'Running' : 'Run Query'}
          </button>
          {state.fingerprint?.id ? (
            <RequestFingerprint
              fingerprintId={state.fingerprint.id}
              correlationId={state.fingerprint.correlationId}
              label="Query fingerprint"
            />
          ) : null}
        </div>
      </section>

      {state.result ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <Panel title="Answer">
              <div className={`mb-3 flex items-start gap-2 rounded-md p-3 text-sm ${isUnavailable ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100' : 'bg-gray-50 text-gray-800 dark:bg-black/20 dark:text-gray-200'}`}>
                {isVerified ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
                <div>{state.result.answer || 'No answer returned.'}</div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Verifier</div>
                  <StatusBadge status={isVerified ? 'succeeded' : 'failed'} label={verifier?.failure || (isVerified ? 'verified' : 'not verified')} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Confidence</div>
                  <div className="text-gray-950 dark:text-white">{verifier?.confidence ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Cost</div>
                  <div className="text-gray-950 dark:text-white">${Number(state.result.cost?.actual_usd || 0).toFixed(4)}</div>
                </div>
              </div>
            </Panel>

            <Panel title="Verified Facts">
              {state.result.verified_facts?.length ? (
                <ul className="list-disc space-y-2 pl-5 text-sm text-gray-800 dark:text-gray-200">
                  {state.result.verified_facts.map((fact, index) => (
                    <li key={`${fact}-${index}`}>{typeof fact === 'string' ? fact : JSON.stringify(fact)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No verified facts returned.</p>
              )}
            </Panel>

            <Panel title="Retrieval Trace">
              {state.result.retrieval_trace?.length ? (
                <pre className="max-h-[380px] overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                  {JSON.stringify(state.result.retrieval_trace, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No trace returned.</p>
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="Citations">
              {state.result.citations?.length ? (
                <ul className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
                  {state.result.citations.map((citation, index) => (
                    <li key={`${citation.source || citation}-${index}`} className="rounded-md bg-gray-50 p-2 dark:bg-black/20">
                      {typeof citation === 'string' ? citation : `${citation.source || 'Source'}${citation.page ? `, p. ${citation.page}` : ''}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No citations returned.</p>
              )}
            </Panel>

            <Panel title="Evidence Packet">
              {state.result.evidence_packet?.length ? (
                <pre className="max-h-[420px] overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                  {JSON.stringify(state.result.evidence_packet, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No evidence packet returned.</p>
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} aria-hidden="true" />
            Run a question to inspect the structured query response.
          </div>
        </div>
      )}
    </div>
  );
}
