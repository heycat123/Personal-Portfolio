const ACTIVE_STATUSES = new Set(['active', 'in_progress', 'partial', 'processing', 'queued', 'running', 'starting']);
const COMPLETE_STATUSES = new Set(['canonical', 'complete', 'completed', 'done', 'ok', 'processed', 'ready', 'succeeded']);

function normalizeStatus(status) {
  return String(status || 'pending').trim().toLowerCase();
}

function statusText(status) {
  return normalizeStatus(status).replace(/_/g, ' ');
}

function segmentState(status) {
  const normalized = normalizeStatus(status);
  if (COMPLETE_STATUSES.has(normalized)) {
    return 'complete';
  }
  if (ACTIVE_STATUSES.has(normalized)) {
    return 'active';
  }
  return 'pending';
}

export default function PipelineReadinessDonut({ items = [], size = 28, t = (value) => value, className = '' }) {
  const normalizedItems = items.slice(0, 3);
  while (normalizedItems.length < 3) {
    normalizedItems.push({
      key: `empty-${normalizedItems.length}`,
      label: 'Processing step',
      status: 'pending',
      color: '#94a3b8',
    });
  }

  const radius = 9;
  const strokeWidth = 5;
  const circumferenceShare = 26;
  const gapShare = 7.333;

  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-label={t('Document processing status')}>
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="false">
        <title>
          {normalizedItems
            .map((item) => `${t(item.label)}: ${t(statusText(item.status))}`)
            .join(' | ')}
        </title>
        {normalizedItems.map((item, index) => {
          const state = segmentState(item.status);
          const color = state === 'complete' ? item.color : state === 'active' ? item.color : '#cbd5e1';
          return (
            <circle
              key={item.key || index}
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${circumferenceShare} ${100 - circumferenceShare}`}
              strokeDashoffset={-(index * (circumferenceShare + gapShare))}
              transform="rotate(-90 12 12)"
              className={state === 'active' ? 'animate-pulse' : ''}
            >
              <title>{`${t(item.label)}: ${t(statusText(item.status))}`}</title>
            </circle>
          );
        })}
        <circle cx="12" cy="12" r="4" fill="currentColor" className="text-white dark:text-[#101820]" aria-hidden="true" />
      </svg>
      <span className="sr-only">
        {normalizedItems
          .map((item) => `${t(item.label)}: ${t(statusText(item.status))}`)
          .join(', ')}
      </span>
    </span>
  );
}
