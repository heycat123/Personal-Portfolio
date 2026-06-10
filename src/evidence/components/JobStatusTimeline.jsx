import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, XCircle } from 'lucide-react';
import { useState } from 'react';
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

function eventPresentation(event, { jobStillProcessing = false, continuationMessage = null } = {}) {
  const eventType = String(event?.event_type || '').toLowerCase();
  const message = String(event?.message || '').trim();
  const successEvent = eventType.includes('succeed') || eventType.includes('complete');
  const genericCompletion = !message || /^job completed\.?$/i.test(message);

  if (jobStillProcessing && successEvent) {
    return {
      title: 'Stage complete',
      message: genericCompletion
        ? continuationMessage || 'This step finished. Processing is still continuing.'
        : message,
      eventType: 'stage_complete',
    };
  }

  return {
    title: humanizeKey(event?.event_type),
    message,
    eventType: event?.event_type,
  };
}

function EventItem({ event, jobStillProcessing = false, continuationMessage = null }) {
  const { t } = useLocaleSettings();
  const presentation = eventPresentation(event, { jobStillProcessing, continuationMessage });
  const tone = eventTone(presentation.eventType);
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
          {t(presentation.title)}
        </p>
        <p
          className="mt-0.5 overflow-hidden text-xs text-gray-600 dark:text-gray-400"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {t(presentation.message)}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-500">{formatDateTime(event.created_at)}</p>
      </div>
    </li>
  );
}

export default function JobStatusTimeline({ events, limit = 4, jobStillProcessing = false, continuationMessage = null }) {
  const { t } = useLocaleSettings();
  const [expanded, setExpanded] = useState(false);
  if (!events?.length) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
        {t('No job events returned.')}
      </p>
    );
  }

  const sortedEvents = [...events].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || '') || 0;
    const rightTime = Date.parse(right?.created_at || '') || 0;
    return leftTime - rightTime;
  });
  const visibleEvents = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? sortedEvents.slice(-Number(limit))
    : sortedEvents;
  const olderEvents = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? sortedEvents.slice(0, Math.max(0, sortedEvents.length - visibleEvents.length))
    : [];
  const hiddenCount = olderEvents.length;
  const renderedEvents = expanded ? sortedEvents : visibleEvents;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      {hiddenCount ? (
        <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {expanded
            ? t('Showing all {count} events.', { count: events.length })
            : t('Showing the latest {count} events. Older events are hidden.', { count: visibleEvents.length })}
        </div>
      ) : null}
      <ol className="p-3">
        {renderedEvents.map((event, index) => (
          <EventItem
            key={`${event.event_type}-${event.created_at}-${index}`}
            event={event}
            jobStillProcessing={jobStillProcessing}
            continuationMessage={continuationMessage}
          />
        ))}
      </ol>
      {hiddenCount ? (
        <div className="border-t border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md px-1 py-1 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-300"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            {expanded
              ? t('Hide older events')
              : t('Show {count} older event(s)', { count: hiddenCount })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
