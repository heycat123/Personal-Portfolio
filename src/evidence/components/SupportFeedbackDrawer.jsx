import { Bug, CheckCircle2, Lightbulb, Send, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import ErrorPanel from './ErrorPanel';
import RequestFingerprint from './RequestFingerprint';
import StatusBadge from './StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';

const DEFAULT_FORMS = {
  idea: {
    title: '',
    description: '',
    impact: '',
    severity: 'low',
    category: 'ui',
  },
  issue: {
    title: '',
    description: '',
    impact: '',
    severity: 'medium',
    category: 'other',
  },
};

const CATEGORY_OPTIONS = ['ui', 'api', 'ai', 'ingestion', 'graph', 'billing', 'access', 'other'];
const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

function routeContext(pathname) {
  const documentMatch = pathname.match(/\/documents\/([^/]+)/);
  const jobMatch = pathname.match(/\/jobs\/([^/]+)/);
  return {
    selected_document_id: documentMatch ? decodeURIComponent(documentMatch[1]) : null,
    visible_job_id: jobMatch ? decodeURIComponent(jobMatch[1]) : null,
  };
}

function browserContext() {
  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    url: window.location.href,
  };
}

function compactApiError(error) {
  if (!error) {
    return null;
  }
  return {
    message: error.message || String(error),
    status: error.status || null,
    request_fingerprint_id: error.requestFingerprintId || error.request_fingerprint_id || null,
    correlation_id: error.correlationId || error.correlation_id || null,
    captured_at: error.capturedAt || error.captured_at || null,
    detail: error.payload?.detail || null,
  };
}

function SubmitResult({ result }) {
  const { t } = useLocaleSettings();
  if (!result?.record) {
    return null;
  }
  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
      <div className="flex items-center gap-2 font-semibold">
        <CheckCircle2 size={16} aria-hidden="true" />
        {t('Submitted')}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal opacity-70">{t('Ticket')}</div>
          <div className="break-all font-mono text-xs leading-5">{result.record.support_record_id}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal opacity-70">{t('Initial category')}</div>
          <div>{result.record.category}</div>
        </div>
      </div>
    </section>
  );
}

export default function SupportFeedbackDrawer({ trigger = 'icon', onOpen }) {
  const location = useLocation();
  const { activeCase } = useCaseContext();
  const { getAccessToken } = useEvidenceAuth();
  const { latestFingerprint, recordFingerprint, status } = useApiStatus();
  const { t } = useLocaleSettings();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
  const showDiagnostics = canSeeOperations || debugEnabled;
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORMS.issue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [latestApiError, setLatestApiError] = useState(null);

  useEffect(() => {
    const handler = (event) => {
      setLatestApiError(event.detail || null);
    };
    window.addEventListener('evidence-api-error', handler);
    return () => window.removeEventListener('evidence-api-error', handler);
  }, []);

  const drawerTitle = mode === 'idea' ? t('Suggest Idea') : t('Report Issue');
  const activeError = latestApiError || status.error || null;
  const derivedContext = useMemo(() => routeContext(location.pathname), [location.pathname]);

  const openDrawer = (nextMode) => {
    setMode(nextMode);
    setForm(DEFAULT_FORMS[nextMode]);
    setError(null);
    setResult(null);
    onOpen?.();
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function submitFeedback(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const token = await getAccessToken();
      const failedFingerprint = activeError?.requestFingerprintId || activeError?.request_fingerprint_id || null;
      const payload = {
        record_type: mode,
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        impact: form.impact.trim() || null,
        category: form.category,
        route: location.pathname,
        request_fingerprint_id: mode === 'issue'
          ? failedFingerprint || latestFingerprint?.id || null
          : latestFingerprint?.id || null,
        selected_document_id: derivedContext.selected_document_id,
        visible_job_id: derivedContext.visible_job_id,
        browser_json: browserContext(),
        context_json: {
          active_case: activeCase,
          latest_api_error: compactApiError(activeError),
          latest_fingerprint: latestFingerprint || null,
          support_ui_version: 'stage_7_10',
        },
      };
      const response = await evidenceApi.createSupportRecord(activeCase.caseId, payload, { token });
      recordFingerprint(response, `${drawerTitle} submitted`);
      setResult(response.data);
      setForm(DEFAULT_FORMS[mode]);
      window.dispatchEvent(new CustomEvent('evidence-support-record-created', { detail: response.data }));
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSaving(false);
    }
  }

  const drawer = mode ? (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={`${t('Close')} ${drawerTitle}`}
        onClick={() => setMode(null)}
        className="absolute inset-0 bg-black/50"
      />
      <div className="absolute bottom-0 right-0 top-0 flex w-screen max-w-full flex-col overflow-x-hidden border-l border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw] sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex min-w-0 items-center gap-2">
            {mode === 'idea' ? <Lightbulb className="shrink-0 text-amber-600 dark:text-amber-300" size={18} aria-hidden="true" /> : <Bug className="shrink-0 text-rose-600 dark:text-rose-300" size={18} aria-hidden="true" />}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-950 dark:text-white">{drawerTitle}</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">{location.pathname}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="h-full overflow-auto overflow-x-hidden p-3 sm:p-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{drawerTitle}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {mode === 'idea'
                    ? t('Ideas are stored without evidence content unless you explicitly describe it.')
                    : showDiagnostics
                      ? t('Issue reports attach route, browser context, and diagnostic context when available.')
                      : t('Describe what happened and what you expected. Support context will be attached automatically.')}
                </p>
              </div>
              {showDiagnostics ? <StatusBadge status="configured" label="Stage 7.10" /> : null}
            </div>

            {mode === 'issue' && activeError ? (
              <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
                <div className="font-semibold">{showDiagnostics ? t('Latest API error will be attached') : t('Recent problem detected')}</div>
                <div className="mt-1">{activeError.message || String(activeError)}</div>
                {debugEnabled ? (
                  <RequestFingerprint
                    fingerprintId={activeError.requestFingerprintId || activeError.request_fingerprint_id}
                    correlationId={activeError.correlationId || activeError.correlation_id}
                    compact
                  />
                ) : null}
              </div>
            ) : null}

            {error ? <div className="mb-4"><ErrorPanel title="Could not submit feedback" error={error} /></div> : null}
            <SubmitResult result={result} />

            <form className="mt-4 space-y-4" onSubmit={submitFeedback}>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Title')}</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={180}
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Description')}</span>
                <textarea
                  required
                  rows={5}
                  minLength={3}
                  maxLength={5000}
                  value={form.description}
                  onChange={(event) => updateForm('description', event.target.value)}
                  className="mt-1 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Category')}</span>
                  <select
                    value={form.category}
                    onChange={(event) => updateForm('category', event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                  >
                    {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Severity')}</span>
                  <select
                    value={form.severity}
                    onChange={(event) => updateForm('severity', event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                  >
                    {SEVERITY_OPTIONS.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Impact')}</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.impact}
                  onChange={(event) => updateForm('impact', event.target.value)}
                  placeholder={t('Optional: what this blocks, risks, or improves.')}
                  className="mt-1 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>

              <button
                type="submit"
                disabled={saving || !form.title.trim() || !form.description.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={15} aria-hidden="true" />
                {saving ? t('Submitting') : t(mode === 'idea' ? 'Submit Idea' : 'Submit Issue')}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => openDrawer('idea')}
        title={t('Suggest Idea')}
        aria-label={t('Suggest Idea')}
        className={trigger === 'sidebar'
          ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
          : 'rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'}
      >
        <Lightbulb size={16} aria-hidden="true" />
        {trigger === 'sidebar' ? <span>{t('Suggest Idea')}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => openDrawer('issue')}
        title={t('Report Issue')}
        aria-label={t('Report Issue')}
        className={trigger === 'sidebar'
          ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
          : 'rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'}
      >
        <Bug size={16} aria-hidden="true" />
        {trigger === 'sidebar' ? <span>{t('Report Issue')}</span> : null}
      </button>
      {drawer && typeof document !== 'undefined' ? createPortal(drawer, document.body) : drawer}
    </>
  );
}
