import { Bot, CornerDownRight, HelpCircle, LocateFixed, Send, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import ErrorPanel from './ErrorPanel';
import StatusBadge from './StatusBadge';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';

function targetDescription(target) {
  if (!target) {
    return null;
  }
  return target.label || target.id;
}

export default function AxiomHelpDrawer() {
  const location = useLocation();
  const { activeCase } = useCaseContext();
  const { getAccessToken } = useEvidenceAuth();
  const { preferences } = useLocaleSettings();
  const [open, setOpen] = useState(false);
  const [guidedHelp, setGuidedHelp] = useState(true);
  const [question, setQuestion] = useState('');
  const [state, setState] = useState({
    loading: false,
    error: null,
    result: null,
  });

  const askAxiom = useCallback(async (event, questionOverride = null) => {
    event?.preventDefault();
    const trimmed = (questionOverride || question).trim();
    if (!trimmed) {
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.queryHelp(
        activeCase.caseId,
        {
          question: trimmed,
          route: location.pathname,
          guided_help: guidedHelp,
          response_language: preferences.language,
          viewer_timezone: preferences.timeZone,
        },
        { token },
      );
      setState({
        loading: false,
        error: null,
        result: result.data,
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [activeCase.caseId, getAccessToken, guidedHelp, location.pathname, preferences.language, preferences.timeZone, question]);

  const askPageQuestion = async () => {
    const pageQuestion = 'How do I use this page?';
    setQuestion(pageQuestion);
    setOpen(true);
    await askAxiom(null, pageQuestion);
  };

  const drawer = open ? (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close Axiom help"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/50"
      />
      <div className="absolute bottom-0 right-0 top-0 flex w-full max-w-xl flex-col border-l border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw]">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="shrink-0 text-sky-700 dark:text-sky-300" size={18} aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-950 dark:text-white">Axiom Help</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">{location.pathname}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="h-full overflow-auto p-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Ask how to use Evidence AI</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Axiom is starting with product documentation and page-aware help. Evidence-data answers still belong in Query.
                </p>
              </div>
              <StatusBadge status="configured" label="Stage 7.9" />
            </div>

            <form id="axiom-help-form" onSubmit={askAxiom} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Question</span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="Example: How do I review aliases on this page?"
                  className="mt-2 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={guidedHelp}
                  onChange={(event) => setGuidedHelp(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-sky-700"
                />
                Include guided-help targets when available
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={state.loading || !question.trim()}
                  className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={15} aria-hidden="true" />
                  {state.loading ? 'Asking' : 'Ask Axiom'}
                </button>
                <button
                  type="button"
                  onClick={askPageQuestion}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                >
                  <CornerDownRight size={15} aria-hidden="true" />
                  This page
                </button>
              </div>
            </form>
          </section>

          {state.error ? <div className="mt-4"><ErrorPanel title="Axiom help failed" error={state.error} /></div> : null}

          {state.result ? (
            <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">Answer</h3>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{state.result.answer}</div>

              {state.result.ui_targets?.length ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                    <LocateFixed size={13} aria-hidden="true" />
                    Guided Targets
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {state.result.ui_targets.map((target) => (
                      <span key={target.id} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100">
                        {targetDescription(target)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask Axiom for help"
        aria-label="Ask Axiom for help"
        className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <HelpCircle size={16} aria-hidden="true" />
      </button>

      {drawer && typeof document !== 'undefined' ? createPortal(drawer, document.body) : drawer}
    </>
  );
}
