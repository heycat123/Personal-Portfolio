import { LockKeyhole, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { caseMatchesRouteId } from '../utils/caseRouting';

const RENAME_ROLES = ['owner', 'admin', 'lawyer'];

export default function SettingsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { activeCase, cases, registerCases } = useCaseContext();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    notice: null,
    fingerprint: null,
  });
  const [caseName, setCaseName] = useState(activeCase.caseName || '');

  const currentCase = useMemo(
    () => cases.find((item) => caseMatchesRouteId(item, caseId)) || activeCase,
    [activeCase, caseId, cases],
  );
  const canRename = Boolean(currentCase.canRename);
  const roleLabel = currentCase.role || 'member';

  const loadCases = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCases({ token });
      recordFingerprint(result, 'Case settings access');
      const nextCases = result.data?.cases || [];
      registerCases(nextCases);
      const nextCase = nextCases.find((item) => caseMatchesRouteId(item, caseId));
      if (nextCase) {
        setCaseName(nextCase.case_name || nextCase.caseName || caseId);
      }
      setState((current) => ({
        ...current,
        loading: false,
        fingerprint: result.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint, registerCases]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    setCaseName(currentCase.caseName || '');
  }, [currentCase.caseName]);

  async function saveCaseName(event) {
    event.preventDefault();
    if (!canRename) {
      return;
    }
    setState((current) => ({ ...current, saving: true, error: null, notice: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.updateCase(caseId, { case_name: caseName.trim() }, { token });
      recordFingerprint(result, 'Rename case');
      if (result.data?.case) {
        registerCases([result.data.case]);
      }
      setCaseName(result.data?.case?.case_name || caseName.trim());
      setState((current) => ({
        ...current,
        saving: false,
        notice: 'Workspace display name updated.',
        fingerprint: result.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Case Settings"
        description="Manage workspace details for the current case."
        actions={
          <button
            type="button"
            onClick={loadCases}
            disabled={state.loading || state.saving}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {t('Refresh')}
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Case settings failed" error={state.error} /></div> : null}

      {state.notice ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          {t(state.notice)}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Workspace display name')}</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('This changes the workspace name only. It does not change any court filing, court case number, or legal record.')}
              </p>
            </div>
            <StatusBadge status={canRename ? 'succeeded' : 'blocked'} label={canRename ? t('editable') : t('restricted')} />
          </div>

          <form className="space-y-4" onSubmit={saveCaseName}>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Workspace display name')}</span>
              <input
                type="text"
                value={caseName}
                onChange={(event) => setCaseName(event.target.value)}
                minLength={3}
                maxLength={180}
                disabled={!canRename || state.saving}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:disabled:bg-black/30 dark:disabled:text-gray-500"
              />
            </label>

            {!canRename ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <LockKeyhole className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <p>
                    {t('Your current case role is')} <span className="font-semibold">{roleLabel}</span>.{' '}
                    {t('Viewer, contributor, and client roles cannot rename this case.')}
                  </p>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canRename || state.saving || caseName.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Save size={16} aria-hidden="true" />
              {state.saving ? t('Saving') : t('Save display name')}
            </button>
          </form>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Current Access')}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Case role')}</dt>
              <dd className="mt-1 font-semibold text-gray-950 dark:text-white">{roleLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Rename roles')}</dt>
              <dd className="mt-1 text-gray-700 dark:text-gray-300">{RENAME_ROLES.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Support details')}</dt>
              <dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">{caseId}</dd>
              <dd className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                {t('This technical route ID is for support. Editing the display name does not change court records or filings.')}
              </dd>
            </div>
          </dl>

          {state.fingerprint ? (
            <div className="mt-5">
              <RequestFingerprint fingerprintId={state.fingerprint} label={t('Settings latest')} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
