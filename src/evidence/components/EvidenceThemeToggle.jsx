import { Moon, Sun } from 'lucide-react';
import { useLocaleSettings } from '../context/LocaleContext';

export default function EvidenceThemeToggle({ darkTheme, setDarkTheme }) {
  const { t } = useLocaleSettings();
  return (
    <button
      type="button"
      onClick={() => setDarkTheme?.(!darkTheme)}
      title={darkTheme ? t('Use light mode') : t('Use dark mode')}
      aria-label={darkTheme ? t('Use light mode') : t('Use dark mode')}
      className="min-h-11 rounded-md border border-[var(--lakai-border-soft)] p-2 text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
    >
      {darkTheme ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
