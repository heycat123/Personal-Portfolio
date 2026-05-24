export function formatCount(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '0';
  }
  return new Intl.NumberFormat().format(Number(value));
}

export function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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
