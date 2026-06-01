import { Archive, CloudOff, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocaleSettings } from '../context/LocaleContext';

const DEFAULT_REASON = 'File does not belong in this case.';

export default function DocumentRemovalDialog({
  busy = false,
  documentName,
  hasSecureWorkspaceCopy = false,
  onClose,
  onConfirm,
  open,
}) {
  const { t } = useLocaleSettings();
  const [mode, setMode] = useState('soft_exclude');
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [confirmation, setConfirmation] = useState('');

  const resetForm = useCallback(() => {
    setMode('soft_exclude');
    setReason(DEFAULT_REASON);
    setConfirmation('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose?.();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, handleClose, open]);

  const deletingWorkspaceCopy = mode === 'delete_workspace_copy';
  const canSubmit = useMemo(() => {
    if (busy) {
      return false;
    }
    if (!deletingWorkspaceCopy) {
      return true;
    }
    return hasSecureWorkspaceCopy && confirmation.trim() === 'DELETE';
  }, [busy, confirmation, deletingWorkspaceCopy, hasSecureWorkspaceCopy]);

  if (!open) {
    return null;
  }

  const submitLabel = deletingWorkspaceCopy ? 'Delete secure workspace copy' : 'Soft remove from workspace';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onConfirm?.({
      reason: reason.trim() || DEFAULT_REASON,
      removal_mode: mode,
      confirm_delete_workspace_copy: deletingWorkspaceCopy,
    });
    resetForm();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="presentation">
      <div
        aria-labelledby="document-removal-dialog-title"
        aria-modal="true"
        className="max-h-[92dvh] w-full max-w-3xl overflow-auto rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#101820]"
        role="dialog"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-normal text-amber-700 dark:text-amber-300">
                <Trash2 size={16} aria-hidden="true" />
                {t('Workspace cleanup')}
              </div>
              <h2 id="document-removal-dialog-title" className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                {t('Remove from workspace')}
              </h2>
              <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-400">
                {documentName || t('Selected document')}
              </p>
            </div>
            <button
              aria-label={t('Keep file and close')}
              className="rounded-md border border-transparent p-2 text-gray-500 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
              disabled={busy}
              onClick={handleClose}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
              <div className="font-semibold">{t('Choose what should happen')}</div>
              <p className="mt-1">
                {t('Neither option deletes the original file from Google Drive or another connected source. This only changes Evidence AI workspace records and, if selected, the secure workspace copy.')}
              </p>
            </div>

            <fieldset className="grid gap-3 md:grid-cols-2">
              <legend className="sr-only">{t('Removal type')}</legend>
              <button
                type="button"
                onClick={() => setMode('soft_exclude')}
                className={`rounded-lg border p-4 text-left transition ${
                  mode === 'soft_exclude'
                    ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/30 dark:border-sky-500 dark:bg-sky-950/30'
                    : 'border-gray-200 bg-gray-50 hover:border-sky-300 dark:border-gray-800 dark:bg-black/20 dark:hover:border-sky-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-sky-100 p-2 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
                    <Archive size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-semibold text-gray-950 dark:text-white">{t('Soft remove from workspace')}</div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-sky-700 dark:text-sky-300">{t('Recommended')}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                  {t('Remove this file from workspace processing, search readiness, and source coverage. Keep the secure workspace copy for audit and support review.')}
                </p>
              </button>

              <button
                type="button"
                onClick={() => hasSecureWorkspaceCopy && setMode('delete_workspace_copy')}
                disabled={!hasSecureWorkspaceCopy}
                className={`rounded-lg border p-4 text-left transition ${
                  mode === 'delete_workspace_copy'
                    ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/30 dark:border-amber-500 dark:bg-amber-950/30'
                    : 'border-gray-200 bg-gray-50 hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-black/20 dark:hover:border-amber-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    <CloudOff size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-semibold text-gray-950 dark:text-white">{t('Delete secure workspace copy')}</div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-amber-700 dark:text-amber-300">{t('Cloud cleanup')}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                  {hasSecureWorkspaceCopy
                    ? t('Do the soft remove and also delete the secure cloud copy stored for this workspace. The original source file is not deleted.')
                    : t('No secure workspace copy is recorded for this file, so only soft remove is available.')}
                </p>
              </button>
            </fieldset>

            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
              {t('Reason for workspace history')}
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-gray-700 dark:bg-[#0c1218] dark:text-gray-100"
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>

            {deletingWorkspaceCopy ? (
              <label className="block rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                {t('Type DELETE to confirm secure-copy deletion')}
                <input
                  className="mt-2 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-amber-900/70 dark:bg-[#0c1218] dark:text-gray-100"
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="DELETE"
                  value={confirmation}
                />
                <span className="mt-2 block text-xs font-normal">
                  {t('This deletes only the secure workspace copy in Evidence AI cloud storage. It does not delete the original source file.')}
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:justify-end">
            <button
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              disabled={busy}
              onClick={handleClose}
              type="button"
            >
              {t('Keep file')}
            </button>
            <button
              className={`inline-flex justify-center rounded-md px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                deletingWorkspaceCopy ? 'bg-amber-700 hover:bg-amber-800' : 'bg-sky-700 hover:bg-sky-800'
              }`}
              disabled={!canSubmit}
              type="submit"
            >
              {busy ? t('Removing') : t(submitLabel)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
