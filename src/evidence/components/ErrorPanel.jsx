import { AlertTriangle } from 'lucide-react';
import RequestFingerprint from './RequestFingerprint';
import { useLocaleSettings } from '../context/LocaleContext';

export default function ErrorPanel({ title = 'Request failed', error, onRetry }) {
  const { t } = useLocaleSettings();
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{t(title)}</h3>
          <p className="mt-1 text-sm text-red-800 dark:text-red-200">
            {error?.message || t('The Evidence API did not return a usable response.')}
          </p>
          {error?.status ? <p className="mt-1 text-xs">HTTP {error.status}</p> : null}
          {error?.requestFingerprintId ? (
            <div className="mt-3">
              <RequestFingerprint fingerprintId={error.requestFingerprintId} compact />
            </div>
          ) : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
            >
              {t('Retry')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
