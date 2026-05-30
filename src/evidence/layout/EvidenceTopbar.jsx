import { HelpCircle, Languages, LifeBuoy, Menu } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import AxiomHelpDrawer from '../components/AxiomHelpDrawer';
import CognitoViewDrawer from '../components/CognitoViewDrawer';
import EvidenceThemeToggle from '../components/EvidenceThemeToggle';
import StatusBadge from '../components/StatusBadge';
import SupportFeedbackDrawer from '../components/SupportFeedbackDrawer';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceCasePath } from '../utils/caseRouting';

export default function EvidenceTopbar({ darkTheme, setDarkTheme, onOpenMenu }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { activeCase } = useCaseContext();
  const { preferences, supportedLanguages, t, updatePreferences, saving: savingLocale } = useLocaleSettings();
  const {
    effectiveCaseRole,
    isPreviewing,
    isRootAdmin,
  } = useOperatorMode();
  const supportPath = evidenceCasePath(activeCase, '/support');

  async function handleLanguageChange(event) {
    try {
      await updatePreferences({ language: event.target.value });
    } catch {
      // The selector keeps the local display preference even if the profile sync is temporarily unavailable.
    }
  }

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 sm:px-4 lg:px-6">
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
          {isRootAdmin && !isPreviewing ? <CognitoViewDrawer /> : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => setHelpOpen((current) => !current)}
              title={t('Help')}
              aria-label={t('Help')}
              aria-expanded={helpOpen}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-2 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white sm:px-3"
            >
              <HelpCircle size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{t('Help')}</span>
            </button>
            {helpOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-800 dark:bg-[#101820]">
                <AxiomHelpDrawer trigger="menu" onOpen={() => setHelpOpen(false)} />
                <SupportFeedbackDrawer trigger="menu" onOpen={() => setHelpOpen(false)} />
                <Link
                  to={supportPath}
                  onClick={() => setHelpOpen(false)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <LifeBuoy size={16} aria-hidden="true" />
                  <span>{t('Support Records')}</span>
                </Link>
              </div>
            ) : null}
          </div>
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
        </div>
      </div>
    </header>
  );
}
