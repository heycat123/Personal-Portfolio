import { Check, Copy, Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { truncateMiddle } from '../utils/formatters';

export default function RequestFingerprint({ fingerprintId, correlationId, label = 'Request fingerprint', compact = false }) {
  const { t } = useLocaleSettings();
  const { debugEnabled } = useOperatorMode();
  const [copied, setCopied] = useState(false);

  if (!debugEnabled || (!fingerprintId && !correlationId)) {
    return null;
  }

  const copyValue = fingerprintId || correlationId;

  const copyToClipboard = async () => {
    if (!copyValue || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 ${compact ? '' : 'rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-[#101820]'}`}>
      <Fingerprint size={14} aria-hidden="true" />
      <span className="font-semibold text-gray-700 dark:text-gray-300">{t(label)}</span>
      {fingerprintId ? (
        <code className="rounded bg-gray-100 px-1.5 py-1 font-mono text-[11px] text-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {truncateMiddle(fingerprintId, compact ? 28 : 44)}
        </code>
      ) : null}
      {correlationId ? (
        <code className="rounded bg-gray-100 px-1.5 py-1 font-mono text-[11px] text-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {truncateMiddle(correlationId, compact ? 24 : 36)}
        </code>
      ) : null}
      <button
        type="button"
        onClick={copyToClipboard}
        title={t('Copy fingerprint')}
        aria-label={t('Copy request fingerprint')}
        className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
    </div>
  );
}
