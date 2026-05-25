export function formatCount(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '0';
  }
  return new Intl.NumberFormat().format(Number(value));
}

function storedDateTimePreferences() {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem('evidence.locale.preferences') || '{}');
    return {
      locale: parsed.language || parsed.locale,
      timeZone: parsed.timeZone || parsed.timezone,
    };
  } catch {
    return {};
  }
}

export function formatDateTime(value, options = {}) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const preferences = storedDateTimePreferences();
  const formatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(options.timeZone || preferences.timeZone ? { timeZone: options.timeZone || preferences.timeZone } : {}),
  };

  try {
    return new Intl.DateTimeFormat(options.locale || preferences.locale || undefined, formatOptions).format(date);
  } catch {
    const safeOptions = { ...formatOptions };
    delete safeOptions.timeZone;
    return new Intl.DateTimeFormat(options.locale || preferences.locale || undefined, safeOptions).format(date);
  }
}

export function humanizeKey(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncateMiddle(value, maxLength = 36) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }

  const sideLength = Math.floor((maxLength - 3) / 2);
  return `${text.slice(0, sideLength)}...${text.slice(-sideLength)}`;
}

export function sumCounts(counts, keys) {
  return keys.reduce((total, key) => total + Number(counts?.[key] || 0), 0);
}
