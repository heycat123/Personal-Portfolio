import { useLocaleSettings } from '../context/LocaleContext';

export default function PageHeader({ title, description, actions, translateTitle = true, translateDescription = true }) {
  const { t } = useLocaleSettings();
  const renderedTitle = translateTitle ? t(title) : title;
  const renderedDescription = translateDescription ? t(description) : description;
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-gray-950 dark:text-white">{renderedTitle}</h2>
        {description ? <p className="mt-1 max-w-3xl break-words text-sm text-gray-600 dark:text-gray-400">{renderedDescription}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:shrink-0">{actions}</div> : null}
    </div>
  );
}
