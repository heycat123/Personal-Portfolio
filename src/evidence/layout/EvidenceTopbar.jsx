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
    <header className="shrink-0 border-b border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)]/95 px-3 py-3 text-[var(--lakai-text)] backdrop-blur sm:px-4 lg:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            className="mt-0.5 rounded-md border border-[var(--lakai-border-soft)] p-2 text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)] lg:hidden"
            title={t('Open navigation')}
            aria-label={t('Open navigation')}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-serif text-xl font-semibold text-[var(--lakai-primary-strong)]">
              {activeCase.caseName}
            </h1>
            <StatusBadge status={activeCase.status} />
            {isPreviewing ? <StatusBadge status="running" label={t('Preview: {role}', { role: effectiveCaseRole })} /> : null}
          </div>
          <p className="mt-1 text-sm text-[var(--lakai-text-muted)]">{activeCase.tenantName}</p>
          </div>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2 text-sm">
          {isRootAdmin && !isPreviewing ? <CognitoViewDrawer /> : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => setHelpOpen((current) => !current)}
              title={t('Help & Support')}
              aria-label={t('Help & Support')}
              aria-expanded={helpOpen}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--lakai-border-soft)] px-2 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)] sm:px-3"
            >
              <HelpCircle size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{t('Help & Support')}</span>
            </button>
            {helpOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 rounded-lg border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] p-2 shadow-xl">
                <AxiomHelpDrawer trigger="menu" onOpen={() => setHelpOpen(false)} />
                <SupportFeedbackDrawer trigger="menu" onOpen={() => setHelpOpen(false)} />
                <Link
                  to={supportPath}
                  onClick={() => setHelpOpen(false)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--lakai-text-muted)] transition-colors hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
                >
                  <LifeBuoy size={16} aria-hidden="true" />
                  <span>{t('Support history')}</span>
                </Link>
              </div>
            ) : null}
          </div>
          <EvidenceThemeToggle darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--lakai-border-soft)] px-2 py-1.5 text-[var(--lakai-text-muted)]">
            <Languages size={16} aria-hidden="true" />
            <span className="sr-only">{t('Language')}</span>
            <select
              value={preferences.language}
              onChange={handleLanguageChange}
              disabled={savingLocale}
              title={t('Display language')}
              className="bg-transparent text-sm font-semibold outline-none"
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
