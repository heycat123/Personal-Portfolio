import { FileQuestion } from 'lucide-react';
import { useLocaleSettings } from '../context/LocaleContext';

export default function EmptyState({ title, description, action }) {
  const { t } = useLocaleSettings();
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-[#101820]">
      <FileQuestion className="mx-auto text-gray-400" size={28} aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{t(title)}</h3>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-400">{t(description)}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
