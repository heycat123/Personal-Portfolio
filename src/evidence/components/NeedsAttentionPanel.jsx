import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocaleSettings } from '../context/LocaleContext';

function interpolate(text, issue) {
  return String(text || '')
    .replaceAll('{count}', String(issue?.count ?? 0))
    .replaceAll('{hashCount}', String(issue?.hashCount ?? 0))
    .replaceAll('{label}', String(issue?.countLabel || ''));
}

function toneClasses(severity) {
  if (severity === 'blocking') {
    return {
      border: 'border-amber-300 dark:border-amber-900/70',
      background: 'bg-amber-50 dark:bg-amber-950/25',
      text: 'text-amber-950 dark:text-amber-100',
      icon: 'text-amber-700 dark:text-amber-200',
      chip: 'border-amber-300 bg-white/80 text-amber-950 dark:border-amber-900/70 dark:bg-[#101820] dark:text-amber-100',
    };
  }
  return {
    border: 'border-sky-200 dark:border-sky-900/70',
    background: 'bg-sky-50 dark:bg-sky-950/20',
    text: 'text-sky-950 dark:text-sky-100',
    icon: 'text-sky-700 dark:text-sky-200',
    chip: 'border-sky-300 bg-white/80 text-sky-950 dark:border-sky-900/70 dark:bg-[#101820] dark:text-sky-100',
  };
}

export default function NeedsAttentionPanel({
  items = [],
  title = 'Needs attention',
  description = 'Important items that affect readiness, sync, access, or review.',
  emptyTitle = 'No attention items right now',
  emptyDetail = 'You can keep working in other parts of the workspace.',
  limit = 6,
}) {
  const { t } = useLocaleSettings();
  const visibleItems = items.slice(0, limit);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t(title)}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t(description)}</p>
        </div>
        <div className="inline-flex w-fit items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
          {items.length ? `${items.length} ${t('open')}` : t('Clear')}
        </div>
      </div>

      {visibleItems.length ? (
        <div className="mt-4 grid gap-3">
          {visibleItems.map((item) => {
            const tone = toneClasses(item.severity);
            return (
              <article key={item.id} className={`rounded-lg border p-3 ${tone.border} ${tone.background} ${tone.text}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle className={`mt-0.5 shrink-0 ${tone.icon}`} size={18} aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{t(item.title)}</h3>
                        {Number.isFinite(Number(item.count)) && Number(item.count) > 0 ? (
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>
                            {item.count} {t(item.countLabel || 'items')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-5">{t(interpolate(item.detail, item))}</p>
                      {item.impact ? (
                        <p className="mt-1 text-xs leading-5 opacity-90">{t(interpolate(item.impact, item))}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {item.to && item.actionLabel ? (
                      <Link
                        to={item.to}
                        className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white/80 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-white dark:border-white/10 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                      >
                        {t(item.actionLabel)}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ) : null}
                    {item.secondaryTo && item.secondaryActionLabel ? (
                      <Link
                        to={item.secondaryTo}
                        className="inline-flex items-center rounded-md border border-black/10 bg-white/40 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10"
                      >
                        {t(item.secondaryActionLabel)}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {hiddenCount ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('{count} more attention item(s) are visible on the related page.', { count: hiddenCount })}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-200" size={18} aria-hidden="true" />
          <div>
            <p className="font-semibold">{t(emptyTitle)}</p>
            <p className="mt-1">{t(emptyDetail)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
