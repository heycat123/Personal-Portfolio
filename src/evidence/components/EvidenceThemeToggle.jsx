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
      className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
    >
      {darkTheme ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
