import { Bug, Languages, Menu, RefreshCw } from 'lucide-react';
import EvidenceThemeToggle from '../components/EvidenceThemeToggle';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { EVIDENCE_API_BASE_URL, EVIDENCE_ENVIRONMENT_LABEL } from '../evidenceConfig';
import { formatDateTime } from '../utils/formatters';

export default function EvidenceTopbar({ darkTheme, setDarkTheme, onOpenMenu }) {
  const { status, latestFingerprint, checkApiHealth } = useApiStatus();
  const { activeCase } = useCaseContext();
  const { preferences, supportedLanguages, t, updatePreferences, saving: savingLocale } = useLocaleSettings();
  const {
    canSeeOperations,
    debugEnabled,
    effectiveCaseRole,
    isPreviewing,
    isRootAdmin,
    openPreviewTab,
    previewRole,
    previewRoles,
    setDebugEnabled,
    setPreviewRole,
  } = useOperatorMode();
  const showOperatorChrome = canSeeOperations || debugEnabled;

  async function handleLanguageChange(event) {
    try {
      await updatePreferences({ language: event.target.value });
    } catch {
      // The selector keeps the local display preference even if the profile sync is temporarily unavailable.
    }
  }

  return (
    <header className="border-b border-gray-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            className="mt-0.5 rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white lg:hidden"
            title={t('Open navigation')}
            aria-label={t('Open navigation')}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-950 dark:text-white">{t('Evidence Workspace')}</h1>
            <StatusBadge status={activeCase.status} />
            {isPreviewing ? <StatusBadge status="running" label={t('Preview: {role}', { role: effectiveCaseRole })} /> : null}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {activeCase.tenantName} / {activeCase.caseName}
          </p>
          </div>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2 text-sm">
          {showOperatorChrome ? <div className="rounded-md border border-gray-200 px-2 py-2 text-gray-700 dark:border-gray-800 dark:text-gray-300 sm:px-3">
            {EVIDENCE_ENVIRONMENT_LABEL}
          </div> : null}
          {showOperatorChrome ? <div className="hidden max-w-xs truncate rounded-md border border-gray-200 px-3 py-2 text-gray-700 dark:border-gray-800 dark:text-gray-300 md:block">
            {EVIDENCE_API_BASE_URL}
          </div> : null}
          {showOperatorChrome ? <StatusBadge status={status.state} /> : null}
          {isRootAdmin ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <span className="text-xs font-semibold">{t('View as')}</span>
              <select
                value={previewRole}
                onChange={(event) => setPreviewRole(event.target.value)}
                className="bg-transparent text-xs font-semibold outline-none dark:bg-amber-950"
                title={t('Preview lower case role')}
              >
                <option value="">{t('Root admin')}</option>
                {previewRoles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button
                type="button"
                onClick={() => openPreviewTab(previewRole || 'contributor')}
                className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50"
              >
                {t('New tab')}
              </button>
            </div>
          ) : null}
          {canSeeOperations ? (
            <button
              type="button"
              onClick={() => setDebugEnabled(!debugEnabled)}
              title={debugEnabled ? t('Hide support diagnostics') : t('Show support diagnostics')}
              aria-label={debugEnabled ? t('Hide support diagnostics') : t('Show support diagnostics')}
              className={`inline-flex items-center gap-2 rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                debugEnabled
                  ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/50'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
            >
              <Bug size={15} aria-hidden="true" />
              <span className="hidden sm:inline">{t('Support mode')}</span>
            </button>
          ) : null}
          <EvidenceThemeToggle darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
          <label className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <Languages size={16} aria-hidden="true" />
            <span className="sr-only">{t('Language')}</span>
            <select
              value={preferences.language}
              onChange={handleLanguageChange}
              disabled={savingLocale}
              title={t('Display language')}
              className="bg-transparent text-sm font-semibold outline-none dark:bg-[#101820]"
            >
              {supportedLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.shortLabel}
                </option>
              ))}
            </select>
          </label>
          {showOperatorChrome ? <button
            type="button"
            onClick={checkApiHealth}
            title={t('Refresh')}
            aria-label={t('Refresh')}
            className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button> : null}
        </div>
      </div>

      {showOperatorChrome ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-500">
        {status.checkedAt ? <span>{t('API checked {time}', { time: formatDateTime(status.checkedAt) })}</span> : null}
        {debugEnabled && latestFingerprint ? <span>{t('Last fingerprint {id}', { id: latestFingerprint.id })}</span> : null}
      </div> : null}
    </header>
  );
}
