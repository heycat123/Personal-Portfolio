import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { useLocaleSettings } from '../context/LocaleContext';
import { formatDateTime, humanizeKey } from '../utils/formatters';

function eventTone(eventType) {
  const normalized = String(eventType || '').toLowerCase();
  if (normalized.includes('succeed') || normalized.includes('complete')) {
    return 'success';
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'error';
  }
  if (normalized.includes('start') || normalized.includes('run')) {
    return 'running';
  }
  return 'default';
}

function EventItem({ event }) {
  const { t } = useLocaleSettings();
  const tone = eventTone(event.event_type);
  return (
    <li className="flex gap-2 pb-2 last:pb-0">
      <div className="mt-0.5 text-gray-500 dark:text-gray-400">
        {tone === 'success' ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
        {tone === 'error' ? <XCircle size={14} aria-hidden="true" /> : null}
        {tone === 'running' ? <Clock size={14} aria-hidden="true" /> : null}
        {tone === 'default' ? <Circle size={14} aria-hidden="true" /> : null}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {t(humanizeKey(event.event_type))}
        </p>
        <p
          className="mt-0.5 overflow-hidden text-xs text-gray-600 dark:text-gray-400"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {event.message}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-500">{formatDateTime(event.created_at)}</p>
      </div>
    </li>
  );
}

export default function JobStatusTimeline({ events, limit = 4 }) {
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
  const olderEvents = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? events.slice(0, Math.max(0, events.length - visibleEvents.length))
    : [];
  const hiddenCount = olderEvents.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      {hiddenCount ? (
        <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {t('Showing the latest {count} events. Older events are collapsed below.', { count: visibleEvents.length })}
        </div>
      ) : null}
      <ol className="max-h-56 overflow-auto p-3">
        {visibleEvents.map((event, index) => (
          <EventItem key={`${event.event_type}-${event.created_at}-${index}`} event={event} />
        ))}
      </ol>
      {hiddenCount ? (
        <details className="border-t border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
          <summary className="cursor-pointer font-semibold text-gray-700 hover:text-sky-700 dark:text-gray-300 dark:hover:text-sky-300">
            {t('Show {count} older event(s)', { count: hiddenCount })}
          </summary>
          <ol className="mt-3 max-h-48 overflow-auto">
            {olderEvents.map((event, index) => (
              <EventItem key={`older-${event.event_type}-${event.created_at}-${index}`} event={event} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
