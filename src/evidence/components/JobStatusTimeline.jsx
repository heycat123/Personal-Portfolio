import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { useLocaleSettings } from '../context/LocaleContext';
import { formatDateTime, humanizeKey } from '../utils/formatters';

function eventIcon(eventType) {
  const normalized = String(eventType || '').toLowerCase();
  if (normalized.includes('succeed') || normalized.includes('complete')) {
    return CheckCircle2;
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return XCircle;
  }
  if (normalized.includes('start') || normalized.includes('run')) {
    return Clock;
  }
  return Circle;
}

export default function JobStatusTimeline({ events, limit = 12 }) {
  const { t } = useLocaleSettings();
  if (!events?.length) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
        {t('No job events returned.')}
      </p>
    );
  }

  const visibleEvents = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? events.slice(-Number(limit))
    : events;
  const hiddenCount = Math.max(0, events.length - visibleEvents.length);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      {hiddenCount ? (
        <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {t('Showing the latest {count} events. Older events stay available in diagnostics.', { count: visibleEvents.length })}
        </div>
      ) : null}
      <ol className="max-h-96 overflow-auto p-4">
      {visibleEvents.map((event, index) => {
        const Icon = eventIcon(event.event_type);
        return (
          <li key={`${event.event_type}-${event.created_at}-${index}`} className="flex gap-3 pb-4 last:pb-0">
            <div className="mt-0.5 text-gray-500 dark:text-gray-400">
              <Icon size={16} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t(humanizeKey(event.event_type))}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{event.message}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{formatDateTime(event.created_at)}</p>
            </div>
          </li>
        );
      })}
      </ol>
    </div>
  );
}
